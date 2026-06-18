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

# Bluetooth-paired printer (pair it once in System Settings → Bluetooth first).
# Pin the port if auto-discovery picks the wrong one:
#   export PRINTER_BT_DEVICE="/dev/cu.NT-1809DD"
export PRINTER_BACKEND="${PRINTER_BACKEND:-bluetooth}"
export PRINTER_BT_HINT="${PRINTER_BT_HINT:-1809}"

# a) open the Stage page in the default browser (returns immediately)
open "$URL"

# b) start the print service in the foreground so launchd keeps it alive
cd "$REPO/apps/printer"
exec "$UV" run end-show-printer
