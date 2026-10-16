#!/usr/bin/env bash
# Site Factory: install a new release zip over an existing install, keeping everything local.
#
# Usage (inside WSL):
#   bash scripts/update.sh /mnt/c/Users/<you>/Downloads/site-factory-X.Y.Z.zip [install-folder]
# The install folder defaults to ~/projects/site-factory.
#
# Kept as they are: client folders (../sf-clients), the inbox, .claude/settings.local.json, vendor/,
# node_modules/ and git history. Everything else in the install folder is replaced by the release. Before copying, the current state is committed so the update
# can be undone with: git -C ~/projects/site-factory reset --hard HEAD~1
set -euo pipefail

ZIP="${1:-}"
TARGET="${2:-$HOME/projects/site-factory}"
[[ -n "$ZIP" && -f "$ZIP" ]] || { echo "Usage: bash scripts/update.sh <site-factory-X.Y.Z.zip> [install-folder]"; exit 2; }
[[ -f "$TARGET/package.json" ]] || { echo "No Site Factory install found at $TARGET"; exit 2; }

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

# Replace the release files: park what stays local, clear the rest, copy the new release, put the parked files back.
KEEP="$TMP/keep"
mkdir -p "$KEEP/templates"
[[ -f .claude/settings.local.json ]] && cp .claude/settings.local.json "$KEEP/settings.local.json"
for t in templates/*/; do
  name="$(basename "$t")"
  [[ -d "$t/node_modules" ]] && mv "$t/node_modules" "$KEEP/templates/$name-node_modules"
done
find . -mindepth 1 -maxdepth 1 ! -name .git ! -name node_modules ! -name vendor -exec rm -rf {} +
cp -a "$NEW/." .
[[ -f "$KEEP/settings.local.json" ]] && cp "$KEEP/settings.local.json" .claude/settings.local.json
for kept in "$KEEP"/templates/*-node_modules; do
  [[ -d "$kept" ]] || continue
  name="$(basename "$kept" -node_modules)"
  [[ -d "templates/$name" ]] && mv "$kept" "templates/$name/node_modules"
done

bash scripts/link-skills.sh
npm ci --no-fund --no-audit
npm run build >/dev/null
for t in templates/*/; do [[ -f "$t/package.json" ]] && (cd "$t" && npm ci --no-fund --no-audit); done
npm test --silent

if [[ -d .git ]]; then git add -A && git commit -qm "Update to $TO" && echo "  committed: Update to $TO"; fi
echo
echo "Done: Site Factory $TO. Start the panel with: npm run panel"
