import os

from dotenv import load_dotenv

# Load apps/printer/.env if present. Real environment variables (exported in
# start-show.sh or the launchd plist) take precedence — .env only fills gaps,
# so it is a convenient local override without clobbering production config.
load_dotenv()

# NT-1809DD is a 58mm printer with a 384-dot print line.
DOTS_PER_LINE = int(os.environ.get("PRINTER_DOTS", "384"))
CHARS_PER_LINE = int(os.environ.get("PRINTER_CHARS", "32"))

# auto | usb | bluetooth | serial | file | dummy
# auto tries usb first, then a paired bluetooth serial port
BACKEND = os.environ.get("PRINTER_BACKEND", "auto")

# Find these with `lsusb` (Linux) or `system_profiler SPUSBDataType` (macOS).
# 0x0416/0x5011 is the id most NT-1809DD units report (Winbond/Nuvoton chipset).
USB_VENDOR_ID = int(os.environ.get("PRINTER_USB_VENDOR", "0x0416"), 16)
USB_PRODUCT_ID = int(os.environ.get("PRINTER_USB_PRODUCT", "0x5011"), 16)

# For BACKEND=serial (Bluetooth pairing exposes a tty)
SERIAL_DEVICE = os.environ.get("PRINTER_SERIAL_DEVICE", "/dev/rfcomm0")
SERIAL_BAUDRATE = int(os.environ.get("PRINTER_SERIAL_BAUDRATE", "9600"))

# For BACKEND=bluetooth. Pairing the printer in the OS exposes a serial
# port (/dev/cu.<Name> on macOS, /dev/rfcomm* on Linux) which is
# auto-discovered; pin it explicitly if discovery picks the wrong one.
BT_DEVICE = os.environ.get("PRINTER_BT_DEVICE", "")
# Substring of the port name to prefer during discovery (e.g. "1809")
BT_HINT = os.environ.get("PRINTER_BT_HINT", "").lower()
BT_BAUDRATE = int(os.environ.get("PRINTER_BT_BAUDRATE", "9600"))

# Seconds before a blocked write aborts. Without this a stalled SPP link
# (no DSR, link asleep) hangs the request forever instead of 503-ing.
WRITE_TIMEOUT_S = int(os.environ.get("PRINTER_WRITE_TIMEOUT_S", "8"))

# Print a test receipt once at startup so the operator gets physical
# confirmation the printer works, without touching the HTTP/relay path.
TEST_ON_START = os.environ.get("PRINTER_TEST_ON_START", "1") == "1"

# For BACKEND=file (Linux usblp driver)
FILE_DEVICE = os.environ.get("PRINTER_FILE_DEVICE", "/dev/usb/lp0")

# Tall rasters are sent as strips with a pause in between; the NT-1809DD's
# small receive buffer overruns (and prints garbage) when a long image is
# streamed in one go.
IMAGE_STRIP_HEIGHT = int(os.environ.get("PRINTER_IMAGE_STRIP", "240"))
IMAGE_STRIP_DELAY_S = int(os.environ.get("PRINTER_IMAGE_DELAY_MS", "120")) / 1000
# bitImageRaster | bitImageColumn | graphics — try bitImageColumn if raster
# output is still garbled on your unit
IMAGE_IMPL = os.environ.get("PRINTER_IMAGE_IMPL", "bitImageRaster")

HOST = os.environ.get("PRINTER_HTTP_HOST", "0.0.0.0")
PORT = int(os.environ.get("PRINTER_HTTP_PORT", "8765"))

# Hot reload on source changes (set by the `bun dev` script; off in production)
RELOAD = os.environ.get("PRINTER_RELOAD", "0") == "1"

# Comma-separated list of allowed browser origins, * for any (LAN kiosk default)
CORS_ORIGINS = os.environ.get("PRINTER_CORS_ORIGINS", "*").split(",")
