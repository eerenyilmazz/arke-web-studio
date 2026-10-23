#!/usr/bin/env bash
# Arke Web Studio: one-command install (Linux, WSL2 Ubuntu or macOS).
#
#   From a clone:       bash scripts/install.sh
#   From the internet:  curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/scripts/install.sh | bash -s -- https://github.com/<owner>/<repo>.git
#
# What it does, in order (safe to run again; it never deletes anything and never installs system packages):
#   1. checks git and Node.js (>= 22.12) and tells you the command to run if one is missing;
#   2. clones the repository into ~/projects/arke-web-studio (ARKE_HOME to change it), unless it runs inside a clone;
#   3. runs scripts/setup-wsl.sh: folders (../arke-clients, ../arke-inbox), npm ci, build, tests, design skills;
#   4. adds two commands to your shell: arke-panel (start the panel) and arke-update (update Arke Web Studio).
set -euo pipefail

REPO="${1:-${ARKE_REPO:-}}"
HOME_DIR="${ARKE_HOME:-$HOME/projects/arke-web-studio}"
MIN_NODE_MAJOR=22
MIN_NODE_MINOR=12

say() { printf '%s\n' "$*"; }
die() { printf 'Kurulum durdu: %s\n' "$*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }

say "== Arke Web Studio kurulumu"

# 1. Tools
has git || die "git yok. Ubuntu/WSL: sudo apt update && sudo apt install -y git · macOS: xcode-select --install"
if ! has node; then
  die "Node.js yok. Kurmak için: curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash, terminali kapatıp açın, sonra: nvm install 22"
fi
v="$(node -p 'process.versions.node')"; major="${v%%.*}"; rest="${v#*.}"; minor="${rest%%.*}"
(( major > MIN_NODE_MAJOR || (major == MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR) )) || die "Node.js $v eski (en az $MIN_NODE_MAJOR.$MIN_NODE_MINOR gerekli): nvm install 22"
case "$(command -v node)" in /mnt/*) die "node Windows'tan geliyor ($(command -v node)). Node'u WSL içine kurun (nvm install 22).";; esac
say "  [OK] git, node $v"

# 2. Where Arke Web Studio lives: this clone, or a fresh clone of REPO.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"
if [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/../package.json" ]] && grep -q '"name": "arke-web-studio"' "$SCRIPT_DIR/../package.json"; then
  DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  say "  [OK] mevcut klasör kullanılıyor: $DIR"
elif [[ -f "$HOME_DIR/package.json" ]]; then
  DIR="$HOME_DIR"
  say "  [OK] zaten kurulu: $DIR (güncellemek için: arke-update)"
else
  [[ -n "$REPO" ]] || die "depo adresi verilmedi. Kullanım: bash install.sh https://github.com/<sahip>/<depo>.git"
  [[ "$REPO" =~ ^(https://|git@)[A-Za-z0-9._@:/~-]+$ ]] || die "depo adresi https://… ya da git@… olmalı."
  mkdir -p "$(dirname "$HOME_DIR")"
  git clone --quiet -- "$REPO" "$HOME_DIR"
  DIR="$HOME_DIR"
  say "  [OK] indirildi: $DIR"
fi
case "$DIR" in /mnt/*) die "Arke Web Studio Windows diskinde ($DIR). Linux diskine (~ altına) kurun: /mnt/c yavaştır ve OneDrive eşitleyebilir.";; esac

# 3. Folders, packages, build, tests, design skills (the existing setup script, which only reports what is missing).
bash "$DIR/scripts/setup-wsl.sh"

# 4. Shell commands: arke-panel and arke-update (a marked block in ~/.bashrc and ~/.zshrc, replaced on every run).
bash "$DIR/scripts/shell-commands.sh" "$DIR"

say ""
say "Kurulum tamam. Yeni bir terminal açın (ya da: source ~/.bashrc), sonra:"
say "  arke-panel    paneli başlatır (adresi terminalde yazar)"
say "  arke-update   yeni sürümü kurar (git ile kurulduysa depodan; zip için: arke-update <zip>)"
say "Panel ilk açılışta adınızı sorar; Cloudflare hesabı ilk yayında istenir."
