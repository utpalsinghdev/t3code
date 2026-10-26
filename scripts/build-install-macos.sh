#!/bin/bash
set -euo pipefail

usage() {
  printf '%s\n' 'Usage: bash scripts/build-install-macos.sh [--check|--help]'
  printf '%s\n' 'Installs dependencies, checks changes, tests desktop packaging and desktop code,'
  printf '%s\n' 'builds a DMG, and installs its app into ~/Applications without launching it.'
}

case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  ''|--check) ;;
  *) usage >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { usage >&2; exit 2; }

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

[[ "$(uname -s)" == Darwin ]] || fail 'This script requires macOS.'
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
export PATH="$HOME/.local/share/vite-plus/bin:$HOME/.cargo/bin:$PATH"
for tool in vp cargo xcode-select hdiutil ditto plutil; do
  command -v "$tool" >/dev/null 2>&1 || fail "Missing prerequisite: $tool. See docs/operations/development.md."
done
xcode-select -p >/dev/null || fail 'Install Xcode Command Line Tools with xcode-select --install.'
[[ -z "${VITE_HTTP_URL:-}" && -z "${VITE_WS_URL:-}" ]] || fail 'Unset VITE_HTTP_URL and VITE_WS_URL before building.'
if [[ -f .t3/setup-running ]]; then
  setup_pid="$(cat .t3/setup-running)"
  if [[ "$setup_pid" =~ ^[0-9]+$ ]] && kill -0 "$setup_pid" 2>/dev/null; then
    fail 'Project setup is running. Wait for it to finish, then run this script again.'
  fi
fi

step "Prerequisites ready; source commit $(git rev-parse --short HEAD)"
if [[ "${1:-}" == --check ]]; then
  exit 0
fi

step 'Installing dependencies from the lockfile'
vp install --frozen-lockfile

step 'Running checks for local changes'
vp run check:changed

step 'Running desktop and packaging tests'
vp test run scripts/build-desktop-artifact.test.ts scripts/lib/build-target-arch.test.ts
vp run --filter @t3tools/desktop test

step 'Building desktop, server, web, and the macOS DMG'
mkdir -p release
artifact_dir="$(mktemp -d "$repo_dir/release/local-build.XXXXXX")"
base_version="$(vp exec node -p "require('./apps/desktop/package.json').version.split('-')[0]")"
build_version="$base_version-local.$(date -u +%Y%m%d%H%M%S)"
vp run dist:desktop:dmg --build-version "$build_version" --output-dir "$artifact_dir"
shopt -s nullglob
dmgs=("$artifact_dir"/*.dmg)
[[ ${#dmgs[@]} -eq 1 ]] || fail "Expected one DMG in $artifact_dir."

mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/t3-install.XXXXXX")"
mounted=false
stage_dir=''
cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$mount_dir" >/dev/null || true
  fi
  rmdir "$mount_dir" 2>/dev/null || true
  if [[ -n "$stage_dir" ]]; then
    rm -rf "$stage_dir"
  fi
}
trap cleanup EXIT

step 'Mounting the built DMG read-only'
hdiutil attach "${dmgs[0]}" -readonly -nobrowse -mountpoint "$mount_dir"
mounted=true
apps=("$mount_dir"/*.app)
[[ ${#apps[@]} -eq 1 ]] || fail 'Expected exactly one app in the DMG.'
app_name="$(basename "${apps[0]}")"
destination="$HOME/Applications/$app_name"
mkdir -p "$HOME/Applications"
stage_dir="$(mktemp -d "$HOME/Applications/.t3-install.XXXXXX")"
ditto "${apps[0]}" "$stage_dir/$app_name"
plutil -lint "$stage_dir/$app_name/Contents/Info.plist"
app_executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$stage_dir/$app_name/Contents/Info.plist")"
[[ -x "$stage_dir/$app_name/Contents/MacOS/$app_executable" ]] || fail 'Built app executable is missing.'

step "Installing $destination"
backup=''
if [[ -e "$destination" || -L "$destination" ]]; then
  backup="$(mktemp -d "$HOME/Applications/T3-backup.XXXXXX")"
  mv "$destination" "$backup/$app_name"
  printf 'Previous user installation preserved at: %s\n' "$backup/$app_name"
fi
if ! mv "$stage_dir/$app_name" "$destination"; then
  if [[ -n "$backup" ]]; then
    mv "$backup/$app_name" "$destination"
  fi
  fail 'Installation failed.'
fi
printf '\nInstalled: %s\nDMG: %s\n' "$destination" "${dmgs[0]}"
printf '%s\n' 'Existing /Applications apps and T3 user data were left in place.'
printf '%s\n' 'Quit your existing T3 app before opening this build. This build is unsigned for distribution.'
printf 'Launch when ready: open "%s"\n' "$destination"
