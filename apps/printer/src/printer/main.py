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
    try:
        with device.session():
            return True
    except Exception as error:
        log.info("printer probe failed: %s", error)
        return False


@app.get("/health")
async def health():
    # printer=True only when we can actually open the device, so the
    # companion UI hides its print button when nothing is attached
    printer = await run_in_threadpool(_probe_printer)
    return {
        "ok": True,
        "printer": printer,
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
