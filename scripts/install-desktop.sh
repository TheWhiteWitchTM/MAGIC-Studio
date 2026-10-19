#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/.local/share/applications" "$HOME/.local/share/icons/hicolor/256x256/apps"
cp "$ROOT/assets/icon.png" "$HOME/.local/share/icons/hicolor/256x256/apps/magic-studio.png"
cat > "$HOME/.local/share/applications/magic-studio.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=MAGIC Studio
Comment=A dark IDE for the MAGIC language
Exec=$ROOT/bin/magic-studio %F
Icon=magic-studio
Terminal=false
Categories=Development;IDE;
StartupWMClass=magic-studio
EOF
chmod +x "$ROOT/bin/magic-studio"
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications" || true
fi
echo "Installed MAGIC Studio in the application menu."
