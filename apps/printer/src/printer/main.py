"""Local HTTP print service.

The companion/stage web app POSTs student content here; this service renders
it as a receipt on the attached NT-1809DD thermal printer.
"""

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config, device, receipt

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
    except Exception:
        return False


@app.get("/health")
async def health():
    # printer=True only when we can actually open the device, so the
    # companion UI hides its print button when nothing is attached
    printer = await run_in_threadpool(_probe_printer)
    return {"ok": True, "printer": printer, "backend": config.BACKEND}


@app.post("/print")
async def print_student(request: PrintRequest):
    try:
        await run_in_threadpool(_print_job, request.model_dump())
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"printer error: {error}")
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

    # reload needs an import string instead of the app object
    uvicorn.run(
        "printer.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=config.RELOAD,
    )


if __name__ == "__main__":
    run()
