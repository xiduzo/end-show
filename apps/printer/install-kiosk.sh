#!/bin/zsh
# Install the kiosk LaunchAgent on THIS host. Resolves all absolute paths
# from where the repo actually lives, so it works no matter where it's cloned.
#
#   cd apps/printer && ./install-kiosk.sh
#
# Re-run after editing start-show.sh or moving the repo. Uninstall:
#   launchctl unload ~/Library/LaunchAgents/com.endshow.kiosk.plist

set -e

HERE="${0:A:h}"                       # apps/printer (absolute)
SCRIPT="$HERE/start-show.sh"
PLIST="$HOME/Library/LaunchAgents/com.endshow.kiosk.plist"
LABEL="com.endshow.kiosk"

chmod +x "$SCRIPT"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SCRIPT</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/endshow-kiosk.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/endshow-kiosk.log</string>
</dict>
</plist>
PLISTEOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "Installed $LABEL"
echo "  script: $SCRIPT"
echo "  plist:  $PLIST"
echo "  logs:   /tmp/endshow-kiosk.log"
