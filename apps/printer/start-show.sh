#!/bin/zsh
# Kiosk startup for the printer host (Mac mini / MacBook next to the printer).
#   1. opens the Stage page (which bridges print jobs to localhost)
#   2. starts the local print service over Bluetooth, in the foreground
#
# Self-locating: works wherever the repo is checked out. Run by the
# LaunchAgent (install with ./install-kiosk.sh) at login, or by hand:
#   ./start-show.sh

set -e

# Resolve the repo from this script's own location: apps/printer/ -> repo root.
HERE="${0:A:h}"            # absolute dir of this script (zsh)
REPO="${HERE:h:h}"         # up two levels: apps/printer -> repo
URL="https://show.xiduzo.com/"
UV="$(command -v uv)"

# Printer connection is configured in apps/printer/.env (see .env.example) so
# it can change without editing this script. Do NOT export PRINTER_* here:
# exported vars override .env (config.py loads .env only to fill gaps), which
# would make the file impossible to override. Pick the backend in .env:
#   USB / usb-serial cable (most reliable):  PRINTER_BACKEND=serial
#                                            PRINTER_SERIAL_DEVICE=/dev/cu.usbserial-XXXX
#   Bluetooth SPP:                           PRINTER_BACKEND=bluetooth
#                                            PRINTER_BT_HINT=printer

# a) open the Stage page in the default browser (returns immediately)
open "$URL"

# b) start the print service in the foreground so launchd keeps it alive
cd "$REPO/apps/printer"
exec "$UV" run end-show-printer
