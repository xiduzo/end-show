"""Connection to the NT-1809DD over the configured backend."""

import glob
import logging
import threading

from escpos.printer import Dummy, File, Serial, Usb

from . import config

log = logging.getLogger("printer.device")

# ESC/POS profile: generic 58mm, no cutter (NT-1809DD has a tear bar only)
PROFILE = "default"

_lock = threading.Lock()

# Ports that show up in /dev/cu.* on macOS but are never the printer
_BT_EXCLUDE = ("bluetooth-incoming-port", "debug-console", "wlan")
# USB-serial adapters also live under /dev/cu.* — not bluetooth
_BT_EXCLUDE_PREFIXES = ("cu.usbserial", "cu.usbmodem")


def discover_bluetooth() -> str:
    """Find the serial port of a paired bluetooth printer.

    Pairing in the OS is what creates the port; this only picks it out.
    """
    if config.BT_DEVICE:
        log.info("bluetooth: using pinned PRINTER_BT_DEVICE=%s", config.BT_DEVICE)
        return config.BT_DEVICE
    candidates = sorted(glob.glob("/dev/cu.*") + glob.glob("/dev/rfcomm*"))
    log.info(
        "bluetooth: scanning serial ports (hint=%r): %s",
        config.BT_HINT or "(none)",
        candidates or "(no /dev/cu.* or /dev/rfcomm* ports at all)",
    )
    matches = []
    for path in candidates:
        name = path.rsplit("/", 1)[-1].lower()
        if any(x in name for x in _BT_EXCLUDE):
            log.debug("bluetooth: skip %s (excluded port)", path)
            continue
        if name.startswith(_BT_EXCLUDE_PREFIXES):
            log.debug("bluetooth: skip %s (usb-serial adapter)", path)
            continue
        if config.BT_HINT and config.BT_HINT not in name:
            log.debug("bluetooth: skip %s (no %r in name)", path, config.BT_HINT)
            continue
        matches.append(path)
    if not matches:
        raise RuntimeError(
            "no paired bluetooth serial port found among "
            f"{candidates or '[]'} (hint={config.BT_HINT!r}) — power on and "
            "connect the printer (the /dev/cu.* node only exists while it is "
            "actively connected), pair it in the OS bluetooth settings, or set "
            "PRINTER_BT_DEVICE"
        )
    log.info("bluetooth: selected %s (candidates: %s)", matches[0], matches)
    return matches[0]


def _connect_usb():
    return Usb(
        config.USB_VENDOR_ID,
        config.USB_PRODUCT_ID,
        profile=PROFILE,
    )


def _connect_bluetooth():
    return Serial(
        devfile=discover_bluetooth(),
        baudrate=config.BT_BAUDRATE,
        profile=PROFILE,
    )


def _connect():
    if config.BACKEND == "auto":
        try:
            return _connect_usb()
        except Exception:
            return _connect_bluetooth()
    if config.BACKEND == "usb":
        return _connect_usb()
    if config.BACKEND == "bluetooth":
        return _connect_bluetooth()
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
