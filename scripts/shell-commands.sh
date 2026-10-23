#!/usr/bin/env bash
# Arke Web Studio: writes the shell commands arke-panel and arke-update into ~/.bashrc (and ~/.zshrc when it exists),
# as a marked block that is replaced on every run. Used by scripts/install.sh.
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
  if grep -qF "# >>> arke-web-studio >>>" "$rc"; then
    awk -v s="# >>> arke-web-studio >>>" -v e="# <<< arke-web-studio <<<" '$0==s{skip=1} !skip{print} $0==e{skip=0}' "$rc" > "$rc.arke-tmp" && mv "$rc.arke-tmp" "$rc"
  fi
  printf '\n%s\n' "$BLOCK" >> "$rc"
  echo "  [OK] komutlar eklendi: $rc (arke-panel, arke-update)"
done
