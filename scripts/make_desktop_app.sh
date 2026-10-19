#!/usr/bin/env bash
# Builds Questlog.app: opens the Questlog web app in its own Chrome window (no tabs or address bar).
# Usage: scripts/make_desktop_app.sh [destination folder]   (default: ~/Desktop)
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${1:-$HOME/Desktop}"
URL="https://m-a-r-k-o-r.github.io/questlog/"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
APP="$DEST/Questlog.app"

[[ -f build/Questlog.icns ]] || python3 scripts/make_icons.py
rm -rf "$APP"
osacompile -o "$APP" -e "do shell script quoted form of \"$CHROME\" & \" --app=$URL > /dev/null 2>&1 &\""
cp build/Questlog.icns "$APP/Contents/Resources/applet.icns"
# Use our icon file instead of the default script icon in the asset catalog.
rm -f "$APP/Contents/Resources/Assets.car"
plutil -remove CFBundleIconName "$APP/Contents/Info.plist" 2>/dev/null || true
plutil -replace CFBundleIconFile -string "applet" "$APP/Contents/Info.plist"
plutil -replace CFBundleIdentifier -string "io.github.m-a-r-k-o-r.questlog" "$APP/Contents/Info.plist"
plutil -replace CFBundleName -string "Questlog" "$APP/Contents/Info.plist"
codesign --force --deep --sign - "$APP" 2>/dev/null
touch "$APP"
echo "Built $APP"
