#!/usr/bin/env bash
# Site Factory: one-time environment check and folder setup for WSL2 (Ubuntu).
#
# Safe to run more than once. It never deletes or overwrites anything and never installs
# system packages; it tells you the command to run instead.
#
# Usage (inside WSL, from the extracted site-factory folder):
#   bash scripts/setup-wsl.sh            # check + create folders + git init + npm ci/build/test
#   bash scripts/setup-wsl.sh --check    # only report, change nothing
set -euo pipefail

CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

FACTORY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="$(dirname "$FACTORY_DIR")"
CLIENTS_DIR="$BASE_DIR/sf-clients"
INBOX_DIR="$BASE_DIR/sf-inbox"
MIN_NODE_MAJOR=22
MIN_NODE_MINOR=12   # Astro 7 (template) needs Node >= 22.12

ok=0; warn=0; fail=0
pass() { echo "  [OK]   $*"; ok=$((ok + 1)); }
note() { echo "  [WARN] $*"; warn=$((warn + 1)); }
bad()  { echo "  [FAIL] $*"; fail=$((fail + 1)); }
has()  { command -v "$1" >/dev/null 2>&1; }

echo "== 1. Environment"
if grep -qi microsoft /proc/version 2>/dev/null; then pass "Running inside WSL"; else note "Not WSL (fine on plain Linux)"; fi
case "$FACTORY_DIR" in
  /mnt/*) bad "Factory is on the Windows drive ($FACTORY_DIR). Move it under ~ (e.g. ~/projects): /mnt/c is slow and may be synced by OneDrive." ;;
  *) pass "Factory is on the Linux disk: $FACTORY_DIR" ;;
esac

echo "== 2. Tools"
if has git; then
  pass "git $(git --version | awk '{print $3}')"
  [[ -n "$(git config --global user.name || true)" ]] && pass "git user.name set" || bad "git user.name missing: git config --global user.name \"Eren ...\""
  [[ -n "$(git config --global user.email || true)" ]] && pass "git user.email set" || bad "git user.email missing: git config --global user.email \"you@example.com\""
  [[ "$(git config --global core.autocrlf || echo unset)" == "true" ]] && note "core.autocrlf=true: set it to input inside WSL (git config --global core.autocrlf input)" || pass "core.autocrlf ok"
else
  bad "git not installed: sudo apt update && sudo apt install -y git"
fi

if has node; then
  v="$(node -p 'process.versions.node')"; major="${v%%.*}"; rest="${v#*.}"; minor="${rest%%.*}"
  if (( major > MIN_NODE_MAJOR || (major == MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR) )); then pass "node $v"
  else bad "node $v is too old (need >= $MIN_NODE_MAJOR.$MIN_NODE_MINOR). Install with nvm: nvm install 22"; fi
  case "$(command -v node)" in /mnt/*) bad "node comes from Windows ($(command -v node)). Install Node inside WSL (nvm).";; esac
else
  bad "node not installed. Install nvm, then: nvm install 22"
fi
has npm && pass "npm $(npm --version)" || bad "npm missing (comes with node)"
has python3 && pass "python3 (optional, for UI UX Pro Max)" || note "python3 missing (only needed for UI UX Pro Max)"

echo "== 3. Claude Code sandbox (Linux needs bubblewrap + socat)"
has bwrap && pass "bubblewrap" || bad "bubblewrap missing: sudo apt install -y bubblewrap"
has socat && pass "socat" || bad "socat missing: sudo apt install -y socat"
if has claude; then
  case "$(command -v claude)" in
    /mnt/*) bad "claude comes from Windows. Install Claude Code inside WSL so the sandbox applies." ;;
    *) pass "claude (Claude Code) found in WSL" ;;
  esac
else
  note "Claude Code CLI not found in WSL. Install it inside WSL and run it from the factory folder."
fi

echo "== 4. Folders"
for d in "$CLIENTS_DIR" "$INBOX_DIR"; do
  if [[ -d "$d" ]]; then pass "exists: $d"
  elif $CHECK_ONLY; then note "would create: $d"
  else mkdir -p "$d" && pass "created: $d"; fi
done

LOCAL_SETTINGS="$FACTORY_DIR/.claude/settings.local.json"
if [[ -f "$LOCAL_SETTINGS" ]]; then
  pass ".claude/settings.local.json exists (not changed)"
elif $CHECK_ONLY; then
  note "would create .claude/settings.local.json for $CLIENTS_DIR"
else
  # '//' = absolute path in Claude Code permission rules.
  cat > "$LOCAL_SETTINGS" <<JSON
{
  "permissions": {
    "deny": [
      "Edit(/$CLIENTS_DIR/**)",
      "Write(/$CLIENTS_DIR/**)"
    ]
  }
}
JSON
  pass "created .claude/settings.local.json (blocks agent edits in $CLIENTS_DIR)"
fi

echo "== 5. Git repository (factory)"
cd "$FACTORY_DIR"
if [[ -d .git ]]; then
  pass "git repo exists (branch: $(git branch --show-current 2>/dev/null || echo '?'))"
elif $CHECK_ONLY; then
  note "would run: git init -b main + first commit"
elif has git && [[ -n "$(git config --global user.email || true)" ]]; then
  [[ -f .gitattributes ]] || printf '* text=auto eol=lf\n*.png binary\n*.jpg binary\n*.webp binary\n*.avif binary\n' > .gitattributes
  git init -q -b main && git add -A && git commit -qm "Initial import of Site Factory" && pass "git repo created with first commit on main"
else
  note "skipped git init (fix git first)"
fi
echo "   Client repos are created by create_client in $CLIENTS_DIR (one repo per client)."

echo "== 6. Install, build, test"
if $CHECK_ONLY; then
  note "skipped (--check)"
elif (( fail > 0 )); then
  note "skipped: fix the FAIL items above, then run this script again"
else
  # if/else, not "cmd && pass": a failing step must show up as FAIL in the summary.
  if npm ci --no-fund --no-audit; then pass "npm ci"; else bad "npm ci failed"; fi
  if npm run build >/dev/null; then pass "npm run build (dist/server.js)"; else bad "npm run build failed"; fi
  if npm test --silent; then pass "npm test"; else bad "npm test failed (see the output above)"; fi
  if (cd templates/corporate-v1 && npm ci --no-fund --no-audit); then pass "template corporate-v1: npm ci"; else bad "template npm ci failed"; fi
  # Design tools: Impeccable comes with npm ci (devDependency); UI UX Pro Max is a pinned git checkout.
  UUPM_DIR="vendor/ui-ux-pro-max"
  UUPM_COMMIT="56ea9cf174ed86786187daa9de0e6247cb0747e4"
  if [[ ! -d "$UUPM_DIR/.git" ]]; then
    git clone -q https://github.com/nextlevelbuilder/ui-ux-pro-max-skill "$UUPM_DIR" && git -C "$UUPM_DIR" checkout -q "$UUPM_COMMIT" \
      && pass "UI UX Pro Max installed" || note "UI UX Pro Max could not be downloaded (the agent then follows rules/design-rules.md only)"
  else
    pass "UI UX Pro Max present"
  fi
  if has python3 && python3 -E -s "$UUPM_DIR/src/ui-ux-pro-max/scripts/search.py" "bakery friendly" --design-system -p Test -f markdown >/dev/null 2>&1; then
    pass "UI UX Pro Max runs"
  else
    note "UI UX Pro Max does not run (needs python3)"
  fi
fi

echo
echo "Summary: $ok ok, $warn warning(s), $fail failure(s)"
(( fail == 0 )) || exit 1
