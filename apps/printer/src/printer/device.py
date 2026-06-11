"""Connection to the NT-1809DD over the configured backend."""

import threading

from escpos.printer import Dummy, File, Serial, Usb

from . import config

# ESC/POS profile: generic 58mm, no cutter (NT-1809DD has a tear bar only)
PROFILE = "default"

_lock = threading.Lock()


def _connect():
    if config.BACKEND == "usb":
        return Usb(
            config.USB_VENDOR_ID,
            config.USB_PRODUCT_ID,
            profile=PROFILE,
        )
    if config.BACKEND == "serial":
        return Serial(
            devfile=config.SERIAL_DEVICE,
            baudrate=config.SERIAL_BAUDRATE,
            profile=PROFILE,
        )
    if config.BACKEND == "file":
        return File(config.FILE_DEVICE, profile=PROFILE)
    if config.BACKEND == "dummy":
        return Dummy(profile=PROFILE)
    raise ValueError(f"Unknown PRINTER_BACKEND: {config.BACKEND}")


def session():
    """Context manager: exclusive access to a fresh printer connection.

    A new connection per job keeps the service resilient to the printer
    being switched off/on between prints.
    """
    return _Session()


class _Session:
    def __enter__(self):
        _lock.acquire()
        try:
            self.printer = _connect()
        except Exception:
            _lock.release()
            raise
        return self.printer

    def __exit__(self, *exc):
        try:
            self.printer.close()
        except Exception:
            pass
        _lock.release()
        return False
