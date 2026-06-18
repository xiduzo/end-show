"""Local HTTP print service.

The companion/stage web app POSTs student content here; this service renders
it as a receipt on the attached NT-1809DD thermal printer.
"""

import logging

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config, device, receipt

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
    with device.session() as printer:
        receipt.print_student(printer, payload)


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
    try:
        await run_in_threadpool(_print_job, request.model_dump())
    except Exception as error:
        log.warning("print failed for %s: %s", request.displayName, error)
        raise HTTPException(status_code=503, detail=f"printer error: {error}")
    log.info("printed receipt for %s", request.displayName)
    return {"printed": request.displayName}


@app.post("/test")
async def print_test():
    def job():
        with device.session() as printer:
            receipt.print_test_page(printer)

    try:
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
    # Probe once at boot so the log shows immediately whether the printer is
    # reachable, instead of only finding out on the first /print (a 503).
    if _probe_printer():
        log.info("startup probe: printer reachable ✓")
        # Physical confirmation the printer actually prints — independent of
        # the browser/relay/HTTP path, which is the usual point of failure.
        if config.TEST_ON_START:
            try:
                with device.session() as printer:
                    receipt.print_test_page(printer)
                log.info("startup test page sent ✓")
            except Exception as error:
                log.warning("startup test page failed: %s", error)
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
