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

# a0) local asset cache. nginx reverse-proxies show-assets.xiduzo.com to local
#     disk (/tmp), so the big screen serves 4K media off the LAN and never hits
#     a browser cache-quota wall. Only flip the kiosk onto it (?proxy=…) once the
#     config tests clean AND it's listening; if nginx is missing or unhealthy we
#     leave PROXY empty and the page loads assets straight from R2 (the app also
#     health-checks /healthz before trusting the proxy). Never block the show on it.
PROXY=""
NGINX="$(command -v nginx || true)"
NGINX_CONF="$REPO/apps/printer/nginx-cache.conf"
# Make the temp/cache dirs BEFORE `-t`: nginx's mkdir is non-recursive, so the
# config test itself fails to create client_body_temp_path (/tmp/endshow-nginx/
# client) when the parent /tmp/endshow-nginx is missing — and that failure would
# leave PROXY empty and silently drop the cache. Create them first, then test.
mkdir -p /tmp/endshow-nginx /tmp/endshow-asset-cache
if [[ -n "$NGINX" ]] && "$NGINX" -c "$NGINX_CONF" -t >/tmp/endshow-nginx-test.log 2>&1; then
  # Already running (e.g. a KeepAlive restart of this script)? Leave it — don't
  # drop the cache mid-show. /tmp is wiped on reboot, so a cold boot starts fresh.
  if ! { [[ -f /tmp/endshow-nginx.pid ]] && kill -0 "$(cat /tmp/endshow-nginx.pid)" 2>/dev/null; }; then
    "$NGINX" -c "$NGINX_CONF" 2>>/tmp/endshow-nginx-error.log || true
    sleep 1
  fi
  if [[ -f /tmp/endshow-nginx.pid ]] && kill -0 "$(cat /tmp/endshow-nginx.pid)" 2>/dev/null; then
    PROXY="?proxy=http://localhost:8080"
    echo "asset cache: nginx up on :8080"
  fi
else
  echo "asset cache: nginx unavailable — assets serve direct from R2" >&2
fi

# a) Firefox kiosk. Launch it FIRST, so the Stage page is up even if the printer
#    has trouble. Wait for the GUI: at login we can fire before WindowServer/Dock
#    is ready and Firefox would silently bail (wait up to 30s, then try anyway).
#    Launch the raw binary, NOT `open`: `open --args` hands the URL to any
#    already-running Firefox and drops the flags, so --kiosk is ignored and you
#    get a normal windowed page. The dedicated --profile + --new-instance force a
#    fresh kiosk instance; the pgrep guard keeps a KeepAlive restart from stacking
#    windows.
FIREFOX="/Applications/Firefox.app/Contents/MacOS/firefox"
for i in {1..30}; do pgrep -xq Dock && break || sleep 1; done
if ! pgrep -f "endshow-kiosk-profile" >/dev/null; then
  "$FIREFOX" --kiosk --new-instance --profile "$PROFILE" "$URL$PROXY" &
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
