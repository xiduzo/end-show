#!/bin/zsh
# Runtime launcher for the end-show kiosk host (Mac mini next to the printer).
# Run at login by the LaunchAgent (install with ./install-kiosk.sh), or by hand
# to test the show before installing:
#   ./start-show.sh
#
# It does two things, then stays in the foreground so launchd can supervise it:
#   1. opens the Stage page in Firefox kiosk mode (fullscreen, no toolbars)
#   2. runs the local Bluetooth print service under caffeinate (no sleep/screensaver)
#
# KeepAlive in the plist restarts this script if the printer dies; the Firefox
# guard below means a restart never stacks a second browser window.

set -e

URL="https://show.xiduzo.com/"
PROFILE="$HOME/.endshow-kiosk-profile"
FIREFOX="/Applications/Firefox.app/Contents/MacOS/firefox"

# Resolve the repo from this script's own location: apps/printer/ -> repo root.
HERE="${0:A:h}"            # absolute dir of this script (zsh)
REPO="${HERE:h:h}"         # up two levels: apps/printer -> repo
UV="$(command -v uv)"

# a) Firefox kiosk — only if it isn't already up (KeepAlive may re-run us).
#    The dedicated --profile keeps it isolated from any personal Firefox and
#    carries the popup-suppressing prefs that install-kiosk.sh seeds.
if ! pgrep -f "endshow-kiosk-profile" >/dev/null; then
  "$FIREFOX" --kiosk --new-instance --profile "$PROFILE" "$URL" &
fi

# b) print service in the foreground; caffeinate keeps the machine + display
#    awake for exactly as long as the service runs.
#    Printer connection is configured in apps/printer/.env (see .env.example).
#    Do NOT export PRINTER_* here: exported vars override .env (config.py loads
#    .env only to fill gaps), which would make the file impossible to override.
cd "$REPO/apps/printer"
exec /usr/bin/caffeinate -dimsu "$UV" run end-show-printer
