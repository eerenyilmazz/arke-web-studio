#!/usr/bin/env bash
# Site Factory: install a new release zip over an existing install, keeping everything local.
#
# Usage (inside WSL):
#   bash scripts/update.sh /mnt/c/Users/<you>/Downloads/site-factory-X.Y.Z.zip [install-folder]
# The install folder defaults to ~/projects/site-factory.
#
# Kept as they are: client folders (../sf-clients), the inbox, .claude/settings.local.json, vendor/,
# node_modules/, dist/ and git history. Before copying, the current state is committed so the update
# can be undone with: git -C ~/projects/site-factory reset --hard HEAD~1
set -euo pipefail

ZIP="${1:-}"
TARGET="${2:-$HOME/projects/site-factory}"
[[ -n "$ZIP" && -f "$ZIP" ]] || { echo "Usage: bash scripts/update.sh <site-factory-X.Y.Z.zip> [install-folder]"; exit 2; }
[[ -f "$TARGET/package.json" ]] || { echo "No Site Factory install found at $TARGET"; exit 2; }
command -v rsync >/dev/null || { echo "rsync is missing: sudo apt install -y rsync"; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP" -d "$TMP"
NEW="$TMP/site-factory"
[[ -f "$NEW/package.json" ]] && grep -q '"name": "site-factory"' "$NEW/package.json" || { echo "This zip is not a Site Factory release."; exit 2; }

version() { node -p "require('$1/package.json').version" 2>/dev/null || echo "?"; }
FROM="$(version "$TARGET")"
TO="$(version "$NEW")"
echo "Updating Site Factory $FROM -> $TO in $TARGET"

cd "$TARGET"
if [[ -d .git ]] && [[ -n "$(git status --porcelain)" ]]; then
  git add -A && git commit -qm "Before update to $TO" && echo "  saved current state (undo with: git reset --hard HEAD~1)"
fi

rsync -a --delete \
  --exclude ".git/" --exclude "node_modules/" --exclude "vendor/" --exclude "dist/" \
  --exclude ".claude/settings.local.json" --exclude "templates/*/node_modules/" --exclude "templates/*/.astro/" \
  "$NEW/" "$TARGET/"

npm ci --no-fund --no-audit
npm run build >/dev/null
for t in templates/*/; do [[ -f "$t/package.json" ]] && (cd "$t" && npm ci --no-fund --no-audit); done
npm test --silent

if [[ -d .git ]]; then git add -A && git commit -qm "Update to $TO" && echo "  committed: Update to $TO"; fi
echo
echo "Done: Site Factory $TO. Start the panel with: npm run panel"
