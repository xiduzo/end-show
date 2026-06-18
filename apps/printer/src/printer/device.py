"""Connection to the NT-1809DD over the configured backend."""

import glob
import logging
import os
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


def list_serial_ports() -> list[str]:
    """All serial ports currently present (bluetooth nodes appear here only
    while the device is connected). Used for startup logs and /health."""
    return sorted(glob.glob("/dev/cu.*") + glob.glob("/dev/rfcomm*"))


def discover_bluetooth(quiet: bool = False) -> str:
    """Find the serial port of a paired bluetooth printer.

    Pairing in the OS is what creates the port; this only picks it out.
    Resolves a path only — it never opens the port. `quiet=True` suppresses
    the INFO scan/selection logs so /health can call it on every poll without
    spamming the log.
    """
    info = (lambda *a: None) if quiet else log.info
    if config.BT_DEVICE:
        info("bluetooth: using pinned PRINTER_BT_DEVICE=%s", config.BT_DEVICE)
        return config.BT_DEVICE
    candidates = sorted(glob.glob("/dev/cu.*") + glob.glob("/dev/rfcomm*"))
    info(
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
    info("bluetooth: selected %s (candidates: %s)", matches[0], matches)
    return matches[0]


def available() -> bool:
    """Cheap, non-blocking availability for /health (polled every 10s).

    Reports whether a printer *target* is resolvable. It deliberately does
    NOT open or write the port: opening on every poll churns the serial link,
    and a write that can't drain would block under _lock and starve /print.
    The real write-probe runs once at startup instead.
    """
    try:
        backend = config.BACKEND
        if backend in ("bluetooth", "auto"):
            discover_bluetooth(quiet=True)
            return True
        if backend == "serial":
            return os.path.exists(config.SERIAL_DEVICE)
        if backend == "file":
            return os.path.exists(config.FILE_DEVICE)
        # usb / dummy: no cheap presence check; assume configured correctly
        return True
    except Exception:
        return False


def _connect_usb():
    return Usb(
        config.USB_VENDOR_ID,
        config.USB_PRODUCT_ID,
        # escpos default is 0 = block forever; bound writes so a dead handle
        # (and the `auto` write-probe below) fails fast instead of hanging.
        timeout=config.USB_TIMEOUT_MS,
        profile=PROFILE,
    )


def _with_write_timeout(printer):
    """Bound how long a serial write may block.

    escpos.Serial.open() forwards only pyserial's READ timeout, so a stalled SPP
    link blocks writes — and the request holding _lock — forever. escpos opens
    the port in __init__, so .device is already live; set write_timeout on it so
    a non-draining write raises SerialTimeoutException (-> 503) instead of hanging.
    """
    printer.device.write_timeout = config.SERIAL_WRITE_TIMEOUT_S
    return printer


def _connect_bluetooth():
    return _with_write_timeout(
        Serial(
            devfile=discover_bluetooth(),
            baudrate=config.BT_BAUDRATE,
            profile=PROFILE,
            # Virtual BT SPP ports never assert DSR, so the default dsrdtr=True
            # hardware handshake makes every write block forever (the "freeze").
            dsrdtr=False,
            xonxoff=False,
        )
    )


def _connect_auto():
    """USB-preferred with a bluetooth fallback.

    A USB handle opening is NOT proof a printer is wired up: libusb can hand back
    a device that then fails on write, or match an unrelated device on the same
    chipset VID/PID. Accept USB only if it takes a real write (ESC @, bounded by
    USB_TIMEOUT_MS); otherwise fall through to the paired bluetooth port. Without
    this, `auto` latches onto a dead USB handle and never reaches bluetooth.
    """
    try:
        printer = _connect_usb()
    except Exception as error:
        log.info("auto: usb unavailable (%s) — trying bluetooth", error)
        return _connect_bluetooth()
    try:
        printer._raw(b"\x1b\x40")  # ESC @ init — must actually reach the device
        return printer
    except Exception as error:
        log.info("auto: usb opened but not printing (%s) — trying bluetooth", error)
        try:
            printer.close()
        except Exception:
            pass
        return _connect_bluetooth()


def _connect():
    if config.BACKEND == "auto":
        return _connect_auto()
    if config.BACKEND == "usb":
        return _connect_usb()
    if config.BACKEND == "bluetooth":
        return _connect_bluetooth()
    if config.BACKEND == "serial":
        return _with_write_timeout(
            Serial(
                devfile=config.SERIAL_DEVICE,
                baudrate=config.SERIAL_BAUDRATE,
                profile=PROFILE,
                dsrdtr=False,
                xonxoff=False,
            )
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

    def __exit__(self, exc_type, exc, tb):
        # On error the write timed out mid-job, so the OS still holds a large
        # undrained backlog; escpos.close() -> flush() -> termios.tcdrain() would
        # then block forever on the stalled link and freeze the server. The job
        # already failed, so drop the backlog to let close() return immediately.
        if exc_type is not None:
            try:
                self.printer.device.reset_output_buffer()
            except Exception:
                pass
        try:
            self.printer.close()
        except Exception:
            pass
        _lock.release()
        return False
