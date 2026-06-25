import os

from dotenv import load_dotenv

# Load apps/printer/.env if present. Real environment variables (exported in
# start-show.sh or the launchd plist) take precedence — .env only fills gaps,
# so it is a convenient local override without clobbering production config.
load_dotenv()

# NT-1809DD is a 58mm printer with a 384-dot print line.
DOTS_PER_LINE = int(os.environ.get("PRINTER_DOTS", "384"))
CHARS_PER_LINE = int(os.environ.get("PRINTER_CHARS", "32"))

# usb | netum | ble  (default: netum)
# usb   drives the printer over USB via python-escpos (escpos.Usb).
# netum drives Netum BT printers via the github.com/Mnewer/netum-printer method:
#   plain pyserial over the paired Bluetooth serial port, raw bytes + flush(), no
#   escpos wrapper (see netum.py).
# ble   drives dual-mode units (e.g. M58-LL) over Bluetooth Low Energy GATT
#   (see ble.py). On these the Classic SPP port connects but never prints — the
#   engine only reads the BLE channel — so ble is the working wireless path there.
BACKEND = os.environ.get("PRINTER_BACKEND", "netum")

# Find these with `lsusb` (Linux) or `system_profiler SPUSBDataType` (macOS).
# 0x0416/0x5011 is the id most NT-1809DD units report (Winbond/Nuvoton chipset).
USB_VENDOR_ID = int(os.environ.get("PRINTER_USB_VENDOR", "0x0416"), 16)
USB_PRODUCT_ID = int(os.environ.get("PRINTER_USB_PRODUCT", "0x5011"), 16)

# For BACKEND=netum. Pairing the printer in the OS exposes a serial
# port (/dev/cu.<Name> on macOS, /dev/rfcomm* on Linux) which is
# auto-discovered; pin it explicitly if discovery picks the wrong one.
BT_DEVICE = os.environ.get("PRINTER_BT_DEVICE", "")
# Substring of the port name to prefer during discovery (e.g. "1809")
BT_HINT = os.environ.get("PRINTER_BT_HINT", "").lower()
BT_BAUDRATE = int(os.environ.get("PRINTER_BT_BAUDRATE", "9600"))

# For BACKEND=ble. macOS hides names in passive scans, so pin the printer by
# its CoreBluetooth address (discover it with ble_probe.py); PRINTER_BLE_NAME is
# a fallback substring match. Leave the write characteristic auto-detected unless
# discovery picks the wrong one.
BLE_ADDRESS = os.environ.get("PRINTER_BLE_ADDRESS", "").strip()
BLE_NAME = os.environ.get("PRINTER_BLE_NAME", "").strip().lower()
BLE_WRITE_CHAR = os.environ.get("PRINTER_BLE_WRITE_CHAR", "").strip().lower()
BLE_SCAN_TIMEOUT_S = float(os.environ.get("PRINTER_BLE_SCAN_TIMEOUT_S", "10"))
BLE_CONNECT_TIMEOUT_S = float(os.environ.get("PRINTER_BLE_CONNECT_TIMEOUT_S", "20"))
# Chunk size for GATT writes; 0 = derive from the negotiated MTU. A small delay
# between chunks keeps the printer's tiny receive buffer from overrunning.
BLE_CHUNK = int(os.environ.get("PRINTER_BLE_CHUNK", "0"))
BLE_CHUNK_DELAY_MS = int(os.environ.get("PRINTER_BLE_CHUNK_DELAY_MS", "20"))
# Write-without-response (WWR) is faster but has no ack and no flow control: under
# a long raster a single dropped/lost chunk shifts every byte after it, smearing
# the whole bitmap ("image prints weird"). Acked writes (response=True) guarantee
# delivery and self-pace (bleak awaits each ack), so they print a clean image at
# the cost of speed. Default to acked when the characteristic offers plain "write";
# set PRINTER_BLE_FORCE_WWR=1 only if a unit accepts WWR exclusively.
BLE_FORCE_WWR = os.environ.get("PRINTER_BLE_FORCE_WWR", "0") == "1"
# write-without-response returns once a chunk is queued, not delivered. Disconnect
# fires when the job's `with` block exits, so without a drain the last (or only)
# packet is dropped before it transmits — small jobs print nothing. Hold the link
# open briefly after the final write so the radio flushes.
BLE_FLUSH_DELAY_MS = int(os.environ.get("PRINTER_BLE_FLUSH_DELAY_MS", "500"))
# Acked writes return once the printer has BUFFERED the bytes, not once it has
# PRINTED them — so send() (and thus /print, and the companion's "printing…"
# state) would report done while paper is still feeding. Hold the call open for
# the estimated physical print time: bytes / this rate. Lower = waits longer
# (safer: button stays disabled until the receipt is really out). 0 disables.
# Tune to the unit's real throughput; ESC 7 head-slowing lowers it.
BLE_DRAIN_BPS = int(os.environ.get("PRINTER_BLE_DRAIN_BPS", "3500"))

# Write timeouts. netum sets this as pyserial's write_timeout; escpos.Usb
# defaults to 0 (= block forever). Without an explicit write timeout a stalled
# link hangs the write — and the request holding the device _lock — indefinitely.
# Bound both so a dead link surfaces as a 503 instead.
#
# SERIAL_WRITE_TIMEOUT_S must exceed the time to clock ONE raster strip out at
# the link baud:
# at 9600 baud (~960 B/s) a 240-row strip (~11.5 KB) needs ~12 s, so the old
# 10 s timed out mid-strip on every raster /print and /test. 25 s clears a
# strip with margin while a genuinely dead link still surfaces instead of
# blocking forever. Raising PRINTER_BT_BAUDRATE is the real speed fix if the
# unit's UART supports it (each strip then drains far faster).
SERIAL_WRITE_TIMEOUT_S = float(os.environ.get("PRINTER_WRITE_TIMEOUT_S", "25"))
USB_TIMEOUT_MS = int(os.environ.get("PRINTER_USB_TIMEOUT_MS", "2000"))

# When BACKEND=ble can't reach the printer (no device found / connect timeout /
# write error), fall back to a wired USB print so a plugged-in cable keeps the
# show running if the radio drops. The fallback re-renders through the live USB
# strip-paced path (not the single-raster BLE byte stream) so the clone's small
# buffer doesn't overrun. Set 0 to disable and let BLE failures surface as 503.
FALLBACK_USB = os.environ.get("PRINTER_FALLBACK_USB", "1") == "1"

# Print a test receipt once at startup so the operator gets physical
# confirmation the printer works, without touching the HTTP/relay path.
TEST_ON_START = os.environ.get("PRINTER_TEST_ON_START", "1") == "1"

# Tall rasters are sent as strips with a pause in between; the NT-1809DD's
# small receive buffer overruns (and prints garbage) when a long image is
# streamed in one go.
IMAGE_STRIP_HEIGHT = int(os.environ.get("PRINTER_IMAGE_STRIP", "240"))
IMAGE_STRIP_DELAY_S = int(os.environ.get("PRINTER_IMAGE_DELAY_MS", "120")) / 1000
# bitImageRaster | bitImageColumn | graphics — try bitImageColumn if raster
# output is still garbled on your unit
IMAGE_IMPL = os.environ.get("PRINTER_IMAGE_IMPL", "bitImageRaster")

# netum backend: raster bytes are written in chunks of this many bytes (paced
# by IMAGE_STRIP_DELAY_S) so the printer's small buffer doesn't overrun.
NETUM_CHUNK = int(os.environ.get("PRINTER_NETUM_CHUNK", "1024"))

# Print-head timing. This clone's ESC 7 takes a SINGLE parameter, max heating
# dots ((n+1)*8): fewer dots heat the line in smaller groups, slowing the paper
# so a slow BLE feed never underruns — that underrun is what prints the faint
# "scanlines". Lower HEAT_MAX_DOTS = slower/cleaner (but can lighten/streak);
# raise it if the print is too slow or faint. Ignored by firmware without ESC 7.
HEAT_TUNE = os.environ.get("PRINTER_HEAT_TUNE", "0") == "1"
HEAT_MAX_DOTS = int(os.environ.get("PRINTER_HEAT_MAX_DOTS", "7"))

HOST = os.environ.get("PRINTER_HTTP_HOST", "0.0.0.0")
PORT = int(os.environ.get("PRINTER_HTTP_PORT", "8765"))

# Hot reload on source changes (set by the `bun dev` script; off in production)
RELOAD = os.environ.get("PRINTER_RELOAD", "0") == "1"

# Comma-separated list of allowed browser origins, * for any (LAN kiosk default)
CORS_ORIGINS = os.environ.get("PRINTER_CORS_ORIGINS", "*").split(",")
