#!/bin/zsh
# One-shot kiosk installer for THIS Mac. Idempotent — re-run after editing
# start-show.sh or moving the repo. Reverse everything with:
#   ./uninstall-kiosk.sh
#
# Sets up three things:
#   1. a Firefox kiosk profile, pre-seeded to suppress crash/restore/welcome popups
#   2. a per-user LaunchAgent that runs start-show.sh at login (RunAtLoad + KeepAlive)
#   3. (optional, asks first) passwordless auto-login, so the show starts on
#      power-on with nobody at the keyboard
#
# Steps 1-2 need no admin rights. Step 3 asks for sudo + the account password.
# Running this immediately starts the show (Firefox goes fullscreen).

set -e

HERE="${0:A:h}"                    # apps/printer (absolute)
SCRIPT="$HERE/start-show.sh"
URL="https://show.xiduzo.com/"
PROFILE="$HOME/.endshow-kiosk-profile"
PLIST="$HOME/Library/LaunchAgents/com.endshow.kiosk.plist"
LABEL="com.endshow.kiosk"
FIREFOX="/Applications/Firefox.app/Contents/MacOS/firefox"

# --- preflight -------------------------------------------------------------
[[ -x "$FIREFOX" ]] || { echo "✗ Firefox not found at $FIREFOX — install Firefox first."; exit 1; }
command -v uv >/dev/null || { echo "✗ uv not found — install it first: https://docs.astral.sh/uv/"; exit 1; }
chmod +x "$SCRIPT" "$HERE/uninstall-kiosk.sh"

# --- 1. Firefox kiosk profile ---------------------------------------------
mkdir -p "$PROFILE"
cat > "$PROFILE/user.js" <<'JS'
// Pre-seeded kiosk prefs: never let a popup interrupt the show.
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("toolkit.startup.max_resumed_crashes", -1);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.aboutwelcome.enabled", false);
user_pref("datareporting.policy.firstRunURL", "");
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("browser.messaging-system.whatsNewPanel.enabled", false);
user_pref("app.update.auto", false);
user_pref("browser.warnOnQuit", false);
user_pref("browser.tabs.warnOnClose", false);
JS
echo "✓ Firefox kiosk profile ready ($PROFILE)"

# --- 2. LaunchAgent --------------------------------------------------------
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>$LABEL</string>
  <key>ProgramArguments</key>  <array><string>$SCRIPT</string></array>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>ProcessType</key>       <string>Interactive</string>
  <key>StandardOutPath</key>   <string>/tmp/endshow-kiosk.log</string>
  <key>StandardErrorPath</key> <string>/tmp/endshow-kiosk.log</string>
</dict>
</plist>
PLISTEOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✓ LaunchAgent installed and started ($LABEL)"

# --- 3. optional passwordless auto-login -----------------------------------
echo
if [[ "$(fdesetup status 2>/dev/null)" == *On* ]]; then
  echo "⚠ FileVault is ON — macOS cannot auto-login while FileVault is enabled."
  echo "  Skipping auto-login. Either turn FileVault off, or log in by hand once"
  echo "  after each boot (the kiosk then starts on its own)."
else
  printf "Enable passwordless auto-login so the show starts on power-on? [Y/n] "
  read -r ans
  if [[ "$ans" != [nN]* ]]; then
    ACCT="$(id -un)"
    printf "Account to auto-login [%s]: " "$ACCT"; read -r a; [[ -n "$a" ]] && ACCT="$a"
    printf "Login password for %s (not echoed): " "$ACCT"; read -rs PW; echo
    # /etc/kcpassword holds the password XOR'd with Apple's fixed cipher; pair it
    # with autoLoginUser so loginwindow logs in without a prompt.
    if printf '%s' "$PW" | sudo /usr/bin/perl -e '
        my @k=(0x7D,0x89,0x52,0x23,0xD2,0xBC,0xDD,0xEA,0xA3,0xB9,0x1F);
        my $p=do{local $/;<STDIN>}; my @b=unpack("C*",$p);
        my $pad=12-(@b%12); push @b,0 for (1..$pad);
        my @o; for my $i (0..$#b){ push @o, $b[$i]^$k[$i%11]; }
        open(my $f,">","/etc/kcpassword") or die $!;
        binmode $f; print $f pack("C*",@o); close $f; chmod 0600,"/etc/kcpassword";
      ' && sudo defaults write /Library/Preferences/com.apple.loginwindow autoLoginUser -string "$ACCT"; then
      echo "✓ Auto-login enabled for $ACCT"
      echo "  NOTE: /etc/kcpassword stores the password in reversible (XOR) form —"
      echo "        standard for a kiosk box, but treat this Mac as trusted."
    else
      echo "⚠ Auto-login step failed — re-run later, or set it in System Settings ›"
      echo "  Users & Groups › Automatically log in as."
    fi
    unset PW
  else
    echo "Skipped auto-login. The kiosk starts after a manual login."
  fi
fi

echo
echo "Done.  URL: $URL"
echo "       logs: /tmp/endshow-kiosk.log"
echo "       turn it all off: $HERE/uninstall-kiosk.sh"
