#!/bin/zsh
# Runtime launcher for the end-show kiosk host (Mac mini next to the printer).
# Run at login by the LaunchAgent (install with ./install-kiosk.sh), or by hand
# to test the show before installing:
#   ./start-show.sh
#
# It does two things, then stays in the foreground so launchd can supervise it:
#   1. opens the Stage page in Firefox kiosk mode (fullscreen, no toolbars)
#   2. runs the local Bluetooth print service under caffeinate (no sleep/screensaver)

# launchd hands an agent a bare PATH (/usr/bin:/bin:/usr/sbin:/sbin). uv installs
# to ~/.local/bin (or Homebrew/cargo) — NOT on that PATH — so `command -v uv`
# would fail and, under `set -e`, kill this script before it launches anything,
# leaving an empty log and no browser. Put the usual spots up front. Don't remove.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

set -e

URL="https://show.xiduzo.com/"
PROFILE="$HOME/.endshow-kiosk-profile"

# Resolve the repo from this script's own location: apps/printer/ -> repo root.
HERE="${0:A:h}"            # absolute dir of this script (zsh)
REPO="${HERE:h:h}"         # up two levels: apps/printer -> repo

# a) Firefox kiosk. Launch it FIRST, so the Stage page is up even if the printer
#    has trouble. Wait for the GUI: at login we can fire before WindowServer/Dock
#    is ready and Firefox would silently bail (wait up to 30s, then try anyway).
#    `open` is more reliable than the raw binary from launchd. The pgrep guard
#    keeps a KeepAlive restart from stacking a second window.
for i in {1..30}; do pgrep -xq Dock && break || sleep 1; done
if ! pgrep -f "endshow-kiosk-profile" >/dev/null; then
  open -na Firefox --args --kiosk --new-instance --profile "$PROFILE" "$URL"
fi

# b) print service in the foreground; caffeinate keeps the machine + display awake
#    for exactly as long as it runs. Printer connection lives in apps/printer/.env
#    (see .env.example) — do NOT export PRINTER_* here; exported vars override .env.
UV="$(command -v uv || true)"
if [[ -z "$UV" ]]; then
  echo "ERROR: uv not found. Install it, or fix PATH. PATH=$PATH" >&2
  exit 1
fi
cd "$REPO/apps/printer"
exec /usr/bin/caffeinate -dimsu "$UV" run end-show-printer
