#!/usr/bin/env bash
# Copies the UI UX Pro Max skills from the pinned vendor checkout into .claude/skills/, next to the
# skills that ship with the factory (impeccable, taste-skill), so the agent can load all of them.
# Safe to run again: it only replaces the copied folders. update.sh and setup-wsl.sh run it.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="vendor/ui-ux-pro-max/.claude/skills"
DEST=".claude/skills"
SKILLS=(ui-ux-pro-max brand design-system)
if [[ ! -d "$SRC" ]]; then
  echo "  note: UI UX Pro Max is not installed (vendor/ui-ux-pro-max); its skills are skipped."
  exit 0
fi
mkdir -p "$DEST"
for s in "${SKILLS[@]}"; do
  [[ -d "$SRC/$s" ]] || continue
  rm -rf "${DEST:?}/$s"
  cp -RL "$SRC/$s" "$DEST/$s"
  echo "  skill: $s"
done
