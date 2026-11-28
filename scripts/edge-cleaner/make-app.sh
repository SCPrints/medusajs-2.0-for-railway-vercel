#!/bin/bash
# Builds ~/Applications/Edge Cleaner.app: a Dock launcher that opens this folder's index.html
# in its own Chrome window. Same kind of launcher as "SC Prints 3D.app", but with no server:
# the page runs straight from the file. Run again after moving the repo.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Applications/Edge Cleaner.app"
PAGE="file://$(printf '%s' "$HERE/index.html" | sed 's/ /%20/g')"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/main.applescript" <<EOF
-- Edge Cleaner: opens the tool in its own Chrome window (the default browser if Chrome is missing).
do shell script "if [ -d '/Applications/Google Chrome.app' ]; then open -na 'Google Chrome' --args --app='$PAGE'; else open '$PAGE'; fi"
EOF
mkdir -p "$HOME/Applications"
rm -rf "$APP"
osacompile -o "$APP" "$TMP/main.applescript"

# Icon: app-icon.png (1024 px) becomes the applet's icon.
mkdir "$TMP/i.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$HERE/app-icon.png" --out "$TMP/i.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$HERE/app-icon.png" --out "$TMP/i.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/i.iconset" -o "$APP/Contents/Resources/applet.icns"
rm -f "$APP/Contents/Resources/Assets.car" # would win over applet.icns

P="$APP/Contents/Info.plist"
plutil -replace CFBundleIdentifier -string au.com.scprints.edgecleaner "$P"
plutil -replace CFBundleName -string "Edge Cleaner" "$P"
plutil -replace LSUIElement -bool true "$P" # the launcher itself shows no second Dock icon
plutil -replace OSAAppletShowStartupScreen -bool false "$P"
plutil -remove CFBundleIconName "$P" 2>/dev/null || true
codesign --force --deep -s - "$APP" 2>/dev/null
touch "$APP"
echo "Built $APP -> $PAGE"
