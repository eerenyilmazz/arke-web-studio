#!/usr/bin/env bash
# Arke Web Studio: moves an install from before the rename (Site Factory, up to 1.29) to the new names. Optional:
# without it everything keeps working with the old folders. Stop the panel first (Ctrl+C), then:
#   bash scripts/migrate-name.sh
#
# Moves (only when the new name does not exist yet; nothing is deleted or overwritten):
#   ~/.config/site-factory        → ~/.config/arke-web-studio   (accounts, client secrets, portal; still encrypted)
#   ../sf-clients, ../sf-inbox    → ../arke-clients, ../arke-inbox
#   the install folder site-factory → arke-web-studio
# and writes the shell commands arke-panel / arke-update. Published sites, Workers and links do not change:
# clients that were published keep their Worker names.
set -euo pipefail

FACTORY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="$(dirname "$FACTORY_DIR")"
moved=0

move() { # move <from> <to> <label>
  if [[ -e "$2" ]]; then echo "  [--] $3: $2 zaten var, dokunulmadı"; return; fi
  if [[ ! -e "$1" ]]; then echo "  [--] $3: eski klasör yok"; return; fi
  mv -- "$1" "$2" && echo "  [OK] $3: $1 → $2" && moved=$((moved + 1))
}

if pgrep -f "dist/panel/server.js" >/dev/null 2>&1; then
  echo "Panel çalışıyor. Önce paneli kapatın (Ctrl+C), sonra tekrar çalıştırın."; exit 2
fi

echo "== Arke Web Studio: yeni adlara geçiş"
move "$HOME/.config/site-factory" "$HOME/.config/arke-web-studio" "hesaplar"
move "$BASE_DIR/sf-clients" "$BASE_DIR/arke-clients" "müşteriler"
move "$BASE_DIR/sf-inbox" "$BASE_DIR/arke-inbox" "gelen dosyalar"

# The agent's folder rule points at the clients folder by its full path.
LOCAL="$FACTORY_DIR/.claude/settings.local.json"
if [[ -f "$LOCAL" ]] && grep -q "/sf-clients" "$LOCAL"; then
  sed -i.bak "s#/sf-clients#/arke-clients#g" "$LOCAL" && echo "  [OK] .claude/settings.local.json güncellendi (yedek: settings.local.json.bak)"
fi

NEW_DIR="$FACTORY_DIR"
if [[ "$(basename "$FACTORY_DIR")" == "site-factory" ]]; then
  move "$FACTORY_DIR" "$BASE_DIR/arke-web-studio" "kurulum klasörü"
  [[ -d "$BASE_DIR/arke-web-studio" ]] && NEW_DIR="$BASE_DIR/arke-web-studio"
fi
bash "$NEW_DIR/scripts/shell-commands.sh" "$NEW_DIR"

echo
echo "Bitti ($moved taşıma). Yeni bir terminal açın (ya da: source ~/.bashrc), sonra: arke-panel"
[[ "$NEW_DIR" != "$FACTORY_DIR" ]] && echo "Kurulum artık burada: $NEW_DIR (bu terminalde: cd $NEW_DIR)"
exit 0
