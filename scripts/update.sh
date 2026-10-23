#!/usr/bin/env bash
# Site Factory: update an install, keeping everything local. Two ways, chosen by what you pass:
#
#   bash scripts/update.sh                         # git install (scripts/install.sh): pull the new version from its repository
#   bash scripts/update.sh <site-factory-X.Y.Z.zip> # zip install: install a release zip over this folder
#   (optional second argument: the install folder; default: the folder this script is in)
#
# Kept as they are: client folders (../sf-clients), the inbox, .claude/settings.local.json, vendor/, graphify-out/,
# node_modules/ and git history. Your settings and accounts live outside the install (~/.config/site-factory and the
# clients folder), so no update touches them.
#   git: refuses to run over local changes; undo with: git reset --hard <previous commit> (printed below).
#   zip: commits the current state first; undo with: git reset --hard HEAD~1
set -euo pipefail

ZIP="${1:-}"
SCRIPT_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${2:-$SCRIPT_HOME}"
[[ -f "$TARGET/package.json" ]] || { echo "No Site Factory install found at $TARGET"; exit 2; }

version() { node -p "require('$1/package.json').version" 2>/dev/null || echo "?"; }

if [[ -z "$ZIP" || "$ZIP" == "--git" ]]; then
  cd "$TARGET"
  [[ -d .git ]] && git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1 || {
    echo "This install has no repository to pull from (it was installed from a zip)."
    echo "Usage: bash scripts/update.sh <site-factory-X.Y.Z.zip>"
    exit 2
  }
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo "Local changes in $TARGET: commit or undo them first (git status)."; exit 2; }
  FROM="$(version .)"
  PREV="$(git rev-parse HEAD)"
  git fetch --quiet
  if [[ "$(git rev-list --count HEAD..@{u})" == "0" ]]; then echo "Site Factory $FROM is up to date."; exit 0; fi
  git pull --ff-only --quiet
  TO="$(version .)"
  echo "Updating Site Factory $FROM -> $TO (undo with: git -C \"$TARGET\" reset --hard ${PREV:0:12})"
  bash scripts/link-skills.sh
  npm ci --no-fund --no-audit
  npm run build >/dev/null
  for t in templates/*/; do [[ -f "$t/package.json" ]] && (cd "$t" && npm ci --no-fund --no-audit); done
  SF_E2E=off npm test --silent
  echo
  echo "Done: Site Factory $TO. Restart the panel: sf-panel"
  exit 0
fi

[[ -f "$ZIP" ]] || { echo "Usage: bash scripts/update.sh [<site-factory-X.Y.Z.zip>]"; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP" -d "$TMP"
NEW="$TMP/site-factory"
[[ -f "$NEW/package.json" ]] && grep -q '"name": "site-factory"' "$NEW/package.json" || { echo "This zip is not a Site Factory release."; exit 2; }

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
find . -mindepth 1 -maxdepth 1 ! -name .git ! -name node_modules ! -name vendor ! -name graphify-out -exec rm -rf {} +
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
# The end-to-end tests (a few minutes) are left out here; run them with: npm run test:e2e
SF_E2E=off npm test --silent

if [[ -d .git ]]; then git add -A && git commit -qm "Update to $TO" && echo "  committed: Update to $TO"; fi
echo
echo "Done: Site Factory $TO. Start the panel: sf-panel (or npm run panel)"
