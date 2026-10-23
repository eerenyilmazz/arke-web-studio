#!/usr/bin/env bash
# Arke Web Studio: writes the shell commands arke-panel and arke-update into ~/.bashrc (and ~/.zshrc when it exists),
# as a marked block that is replaced on every run. The block of the old name (site-factory) is removed.
# Used by scripts/install.sh and scripts/migrate-name.sh.
#   bash scripts/shell-commands.sh <install-folder>
set -euo pipefail
DIR="${1:?usage: bash scripts/shell-commands.sh <install-folder>}"
BLOCK="# >>> arke-web-studio >>>
unalias arke-panel arke-update 2>/dev/null || true
arke-panel() { (cd \"$DIR\" && npm run panel); }
arke-update() { bash \"$DIR/scripts/update.sh\" \"\$@\"; }
# <<< arke-web-studio <<<"
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  [[ -f "$rc" || "$rc" == "$HOME/.bashrc" ]] || continue
  touch "$rc"
  for marker in "arke-web-studio" "site-factory"; do
    if grep -qF "# >>> $marker >>>" "$rc"; then
      awk -v s="# >>> $marker >>>" -v e="# <<< $marker <<<" '$0==s{skip=1} !skip{print} $0==e{skip=0}' "$rc" > "$rc.arke-tmp" && mv "$rc.arke-tmp" "$rc"
    fi
  done
  printf '\n%s\n' "$BLOCK" >> "$rc"
  echo "  [OK] komutlar eklendi: $rc (arke-panel, arke-update)"
done
