"""Local HTTP print service.

The companion/stage web app POSTs student content here; this service renders
it as a receipt on the attached NT-1809DD thermal printer.
"""

import logging

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import ble, config, device, netum, receipt

log = logging.getLogger("printer")

app = FastAPI(title="end-show printer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PrintRequest(BaseModel):
    displayName: str = Field(min_length=1)
    pronouns: str = ""
    track: str = ""
    introduction: str = ""
    competencies: list[str] = []
    link: str = ""
    portraitUrl: str | None = None


def _print_job(payload: dict) -> None:
    if config.BACKEND == "netum":
        # netum owns the wire itself: render the rich receipt to raw ESC/POS
        # bytes and stream them over the direct pyserial connection.
        data = receipt.render_student_bytes(payload)
        with netum.NetumPrinter() as printer:
            if not printer.is_connected:
                raise RuntimeError(f"netum: could not connect to {printer.port}")
            printer.print_bytes(data)
        return
    with device.session() as printer:
        receipt.print_student(printer, payload)


async def _ble_or_usb(render, usb_job) -> None:
    """Print over BLE; on failure (when enabled) fall back to a wired USB print.

    render() -> bytes produces the ESC/POS stream for the BLE transport.
    usb_job(printer) prints the same content over a live USB session — it
    re-renders through the strip-paced USB path rather than replaying the
    single-raster BLE bytes, which the clone's small buffer would overrun.
    """
    data = await run_in_threadpool(render)
    try:
        await ble.send(data)
        return
    except Exception as ble_error:
        if not config.FALLBACK_USB:
            raise
        log.warning("ble print failed (%s) — falling back to USB", ble_error)

    def fallback():
        with device.session("usb") as printer:
            usb_job(printer)

    try:
        await run_in_threadpool(fallback)
    except Exception as usb_error:
        raise RuntimeError(
            f"ble unreachable and usb fallback failed: {usb_error}"
        ) from usb_error


def _probe_printer() -> bool:
    # Startup-only write probe: opening a virtual BT SPP node is not proof it
    # prints, so write an ESC @ (init) and let a failed write surface a dead
    # link. NOT used by /health — a blocking write under _lock on every poll
    # would starve /print.
    try:
        with device.session() as printer:
            printer._raw(b"\x1b\x40")
            return True
    except Exception as error:
        log.info("printer probe failed: %s", error)
        return False


@app.get("/health")
async def health():
    # Cheap, non-blocking: report whether a printer target is resolvable.
    # /health is polled every 10s by the Stage bridge and shares _lock with
    # /print, so it must never open or write the port.
    return {
        "ok": True,
        "printer": device.available(),
        "backend": config.BACKEND,
        "serial_ports": device.list_serial_ports(),
    }


@app.post("/print")
async def print_student(request: PrintRequest):
    payload = request.model_dump()
    try:
        if config.BACKEND == "ble":
            # BLE is async: render bytes off the loop, then stream them over GATT.
            # If the radio is unreachable, _ble_or_usb falls back to wired USB.
            await _ble_or_usb(
                lambda: receipt.render_student_bytes(payload),
                lambda printer: receipt.print_student(printer, payload),
            )
        else:
            await run_in_threadpool(_print_job, payload)
    except Exception as error:
        log.warning("print failed for %s: %s", request.displayName, error)
        raise HTTPException(status_code=503, detail=f"printer error: {error}")
    log.info("printed receipt for %s", request.displayName)
    return {"printed": request.displayName}


@app.post("/test")
async def print_test():
    try:
        if config.BACKEND == "ble":
            await _ble_or_usb(receipt.render_test_bytes, receipt.print_test_page)
        else:
            def job():
                if config.BACKEND == "netum":
                    with netum.NetumPrinter() as printer:
                        if not printer.is_connected:
                            raise RuntimeError(f"netum: could not connect to {printer.port}")
                        # plain text proves the channel; then the raster page proves imaging
                        netum.print_connection_test(printer)
                        printer.print_bytes(receipt.render_test_bytes())
                    return
                with device.session() as printer:
                    receipt.print_test_page(printer)

            await run_in_threadpool(job)
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"printer error: {error}")
    return {"printed": "test page"}


def run():
    import uvicorn

    # force=True: some imported libs install a logging handler first, which
    # would make a plain basicConfig() a no-op and swallow our INFO diagnostics.
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        force=True,
    )
    logging.getLogger("printer").setLevel(logging.INFO)

    log.info(
        "starting end-show printer: backend=%s host=%s port=%s "
        "bt_device=%r bt_hint=%r",
        config.BACKEND,
        config.HOST,
        config.PORT,
        config.BT_DEVICE or "(auto-discover)",
        config.BT_HINT or "(none)",
    )
    # Always list the serial ports present, independent of backend/pin, so the
    # log shows what is actually connected even before any print is attempted.
    ports = device.list_serial_ports()
    if ports:
        log.info("serial ports present (%d): %s", len(ports), ", ".join(ports))
    else:
        log.warning(
            "no /dev/cu.* or /dev/rfcomm* ports present at all — nothing is "
            "connected; power on and connect the printer (its node only exists "
            "while connected)"
        )
    # Show at boot whether the printer is reachable, instead of only finding out
    # on the first /print (a 503). The self-test IS the probe — printing it
    # proves the link — so open the printer once, not twice: opening a virtual
    # BT SPP port churns the link and can drop the connection. It prints a small
    # raster (this clone ignores ESC/POS plaintext and would feed blank paper,
    # "succeeding" without proving anything; a short bitmap instead drains fast
    # yet puts visible marks on paper — real proof the raster path works).
    if config.TEST_ON_START:
        try:
            if config.BACKEND == "ble":
                import asyncio

                try:
                    asyncio.run(ble.probe())
                except Exception as ble_error:
                    if not config.FALLBACK_USB:
                        raise
                    log.warning(
                        "startup self-test: ble unreachable (%s) — trying USB",
                        ble_error,
                    )
                    with device.session("usb") as printer:
                        receipt.print_self_test(printer)
            elif config.BACKEND == "netum":
                with netum.NetumPrinter() as printer:
                    if not printer.is_connected:
                        raise RuntimeError(f"netum: could not connect to {printer.port}")
                    netum.print_connection_test(printer)
            else:
                with device.session() as printer:
                    receipt.print_self_test(printer)
            log.info("startup self-test printed ✓ — printer reachable")
        except Exception as error:
            log.warning(
                "startup self-test failed — printer NOT reachable (%s); /print "
                "will 503 until the printer is connected (see scan above)",
                error,
            )
    elif _probe_printer():
        log.info("startup probe: printer reachable ✓")
    else:
        log.warning(
            "startup probe: printer NOT reachable — /print will 503 until the "
            "printer is powered on and connected (see discovery scan above)"
        )

    # reload needs an import string instead of the app object
    uvicorn.run(
        "printer.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=config.RELOAD,
    )


if __name__ == "__main__":
    run()
