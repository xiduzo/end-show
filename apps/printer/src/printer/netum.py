"""Direct Bluetooth-serial transport for Netum thermal printers.

A port of github.com/Mnewer/netum-printer (NetumPrinter) into the service.
That project drives Netum BT printers (NT-1809D and compatible) the simplest
possible way: open the paired Bluetooth SPP port with plain pyserial and write
raw bytes followed by flush() — no python-escpos, no profile, no GS-raster
command wrangling. On these units that is the path that actually marks paper;
the escpos Serial wrapper clocked bytes out of the port but printed nothing.

Two adaptations vs upstream:
  * Port resolution — upstream auto-discovers a Windows COM port, and its README
    lists macOS as unsupported ("macOS lacks serial backend for Bluetooth SPP").
    With the vendor macOS driver installed the printer exposes a working
    /dev/cu.* node, so we resolve the port from PRINTER_BT_DEVICE /
    PRINTER_BT_HINT (the resolver the other backends already use).
  * print()s become logging, and a chunked sender is added so a tall raster
    receipt can't overrun the printer's small buffer or blow the write timeout.

print_text() accepts bytes exactly as upstream does, so a rich receipt rendered
to raw ESC/POS bytes (see receipt.render_student_bytes) rides the same wire as
plain text — the channel does not care which it is.
"""

import logging
import time
from typing import Optional, Union

import serial

from . import config

log = logging.getLogger("printer.netum")


def _resolve_port() -> str:
    """Pick the serial port for the printer.

    Upstream scans Windows COM ports; on macOS the paired printer is a
    /dev/cu.<Name> node, so reuse the shared bluetooth resolver (honours
    PRINTER_BT_DEVICE and PRINTER_BT_HINT). Imported lazily to avoid a module
    import cycle with device.py.
    """
    if config.BT_DEVICE:
        return config.BT_DEVICE
    from .device import discover_bluetooth

    return discover_bluetooth()


class NetumPrinter:
    """Interface for Netum Bluetooth thermal printers (direct pyserial)."""

    def __init__(self, port: Optional[str] = None, baudrate: Optional[int] = None):
        self.port = port or _resolve_port()
        self.baudrate = baudrate or config.BT_BAUDRATE
        self.connection: Optional[serial.Serial] = None
        self.is_connected = False

    def connect(self) -> bool:
        """Open the serial connection. Returns True on success."""
        try:
            self.connection = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=8,
                parity=serial.PARITY_NONE,
                stopbits=1,
                timeout=3,
                # upstream uses 3s; raster receipts need longer to clock out, so
                # use the shared (chunk-sized) write timeout instead.
                write_timeout=config.SERIAL_WRITE_TIMEOUT_S,
            )
            self.is_connected = True
            log.info("netum: connected on %s @ %d baud", self.port, self.baudrate)
            return True
        except serial.SerialException as error:
            log.warning(
                "netum: connection failed on %s (%s) — check the printer is on, "
                "paired AND connected, and not held by another app",
                self.port,
                error,
            )
            self.is_connected = False
            return False

    def disconnect(self) -> None:
        if self.connection and self.connection.is_open:
            self.connection.close()
            log.info("netum: disconnected from %s", self.port)
        self.is_connected = False

    def print_text(self, text: Union[str, bytes]) -> bool:
        """Write text (UTF-8) or raw bytes, then flush. Faithful to upstream."""
        if not self.is_connected or not self.connection:
            log.warning("netum: not connected")
            return False
        data = text.encode("utf-8") if isinstance(text, str) else text
        self.connection.write(data)
        self.connection.flush()
        return True

    def print_line(self, text: str = "") -> bool:
        return self.print_text(text + "\n")

    def feed_lines(self, count: int = 3) -> bool:
        return self.print_text("\n" * count)

    def print_bytes(
        self, data: bytes, chunk: Optional[int] = None, delay: Optional[float] = None
    ) -> bool:
        """Stream a large raw blob (a rendered raster receipt) in paced chunks.

        Upstream's print_text() does one write+flush, which is fine for a few
        lines of text but would overrun the printer's small buffer (garbage) or
        blow the write timeout on a tens-of-KB raster. Chunking keeps each write
        small and lets the print head catch up between chunks.
        """
        if not self.is_connected or not self.connection:
            log.warning("netum: not connected")
            return False
        chunk = chunk or config.NETUM_CHUNK
        delay = config.IMAGE_STRIP_DELAY_S if delay is None else delay
        for i in range(0, len(data), chunk):
            self.connection.write(data[i : i + chunk])
            self.connection.flush()
            if delay and i + chunk < len(data):
                time.sleep(delay)
        return True

    def __enter__(self) -> "NetumPrinter":
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        self.disconnect()
        return False


def print_connection_test(printer: "NetumPrinter") -> None:
    """Plain-text proof-of-life (upstream test_connection(), trimmed).

    No raster — a print here proves the Bluetooth serial channel reaches the
    print engine. If this prints but a raster receipt does not, the problem is
    the image command, not the connection (try PRINTER_IMAGE_IMPL=bitImageColumn).
    """
    printer.print_line("=" * 32)
    printer.print_line("       end-show printer")
    printer.print_line("       netum link OK")
    printer.print_line(time.strftime("%Y-%m-%d %H:%M:%S"))
    printer.print_line("=" * 32)
    printer.feed_lines(3)
