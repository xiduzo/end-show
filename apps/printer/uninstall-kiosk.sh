#!/bin/zsh
# Fully reverse install-kiosk.sh on THIS Mac. Safe to run repeatedly.
#   ./uninstall-kiosk.sh
#
# Stops + removes the LaunchAgent, quits the kiosk Firefox, disables auto-login
# (only if install enabled it), and offers to delete the Firefox kiosk profile.

set -e

HERE="${0:A:h}"
PROFILE="$HOME/.endshow-kiosk-profile"
PLIST="$HOME/Library/LaunchAgents/com.endshow.kiosk.plist"
LABEL="com.endshow.kiosk"

# 1. stop + remove the LaunchAgent
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "✓ LaunchAgent removed"

# 2. quit the kiosk Firefox (matches the dedicated profile, leaves personal Firefox alone)
pkill -f "endshow-kiosk-profile" 2>/dev/null || true
echo "✓ Kiosk Firefox stopped"

# 2b. stop the local asset-cache nginx (started by start-show.sh)
if command -v nginx >/dev/null; then
  nginx -c "$HERE/nginx-cache.conf" -s quit 2>/dev/null || true
fi
rm -rf /tmp/endshow-asset-cache /tmp/endshow-nginx /tmp/endshow-nginx.pid
echo "✓ Asset cache stopped + cleared"

# 3. disable auto-login, only if it's currently set (needs sudo)
if [[ -f /etc/kcpassword ]] || defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser >/dev/null 2>&1; then
  echo "Disabling auto-login (needs admin)…"
  sudo defaults delete /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null || true
  sudo rm -f /etc/kcpassword
  echo "✓ Auto-login disabled"
else
  echo "• Auto-login was not set — nothing to undo"
fi

# 4. optional: drop the Firefox kiosk profile
printf "Also delete the Firefox kiosk profile (%s)? [y/N] " "$PROFILE"
read -r ans
if [[ "$ans" == [yY]* ]]; then rm -rf "$PROFILE"; echo "✓ Profile deleted"; fi

echo
echo "Done. Kiosk agent gone, auto-login off. Reboot to confirm a normal login."
