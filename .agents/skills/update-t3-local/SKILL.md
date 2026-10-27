---
name: update-t3-local
description: Merge upstream T3 Code into the Local fork, rebuild its desktop app and matching SSH runtimes, and verify the installation.
---

# Update T3 Code Local

Update the Local fork from upstream through a verified installation. Every update must include the forked server runtime, including Pi token-speed support, in both the macOS app and its Linux SSH runtimes. A working HTTP endpoint alone is not evidence of a successful update.

## Preserve the running installation

Inspect the current branch, worktrees, dirty and untracked files, remotes, upstream tips, installed app version, and relevant running services before changing anything. Preserve unrelated work. Identify a usable rollback copy of `/Applications/T3 Code (Local).app` and the current remote runtime before replacing them; a build directory that will be overwritten is not a rollback. Do not reset, discard, overwrite, or commit unrelated changes.

Local uses `~/.t3-local` on the Mac. The home server uses `~/.t3` and its user `t3code.service`, with lingering enabled. Never start a dev server against live data or open the live database writable. Do not stop or restart a running app, service, or agent if doing so would interrupt active work without the user's approval. Never kill by process-name or path pattern, reboot, or manually patch runtime binaries. Do not use browser or computer interaction without explicit authorization.

## Merge and verify

1. Fetch the appropriate remotes and inspect their branches. Merge the intended latest upstream branch into the Local branch with an ordinary merge, preserving upstream improvements and fork customizations. Do not rebase published history, force-push, or update an unrelated branch. Resolve conflicts deliberately; stop on unclear ownership of local changes.
2. Inspect current repository instructions and CI workflows, dependency and lockfile changes, and relevant install scripts. Install dependencies using the repository's current procedure. Run `vp run check:changed` and focused tests for affected behavior, including the Pi provider's `turnTokenUsage` path in `packages/provider-pi/src/server/adapter.ts` and its tests. Investigate failures; report unavailable checks rather than bypassing them. Respect the repository prohibition on repo-wide checks.
3. Choose a new full Local build version, incrementing the existing `-local.N` suffix. Use exactly that version and the same verified source state for desktop, server, web, and Linux x64 and arm64 CLI archives. Do not strip the Local suffix or substitute an upstream download for the fork runtime. Verify that the Pi `turnTokenUsage` implementation is present in the source and included in the built server.

## Build and install

Inspect the current `scripts/build-cli-archive.ts`, `scripts/build-desktop-artifact.ts`, and relevant build workflows for their actual arguments and prerequisites before building. Build the Linux archives from the same source/version using the supported build pipeline, and confirm archive names, contents, checksums, and architecture. Pass their directory to desktop packaging with `--ssh-runtimes <directory>` or `T3CODE_DESKTOP_SSH_RUNTIMES`; the default is `release-cli`. It expects `t3-<full-local-version>-linux-x64.tar.gz` and `t3-<full-local-version>-linux-arm64.tar.gz` and generates SHA-256 sidecars while staging. Verify these interfaces in the current source before use. If packaging cannot embed both matching fork archives, stop; do not ship an incomplete update.

Build the macOS Local artifact with those archives embedded under the app's resources `ssh-runtimes` directory. Inspect the packaged app's version and archive hashes, and verify its server and web assets came from the same source state. The existing `scripts/build-install-macos.sh` installs to `~/Applications` and may not support bundled SSH runtimes; inspect it before use and do not assume it installs the requested app.

The bundled helper performs the aligned build and restores the original manifest bytes, including unrelated edits:

```sh
python3 .agents/skills/update-t3-local/scripts/build-local.py \
  --version <new-full-local-version> \
  --resource-monitor-dir <directory-with-linux-x64-and-linux-arm64-subdirectories> \
  --output-dir <new-release-directory> \
  --temp-dir <existing-build-temporary-directory>
```

Use the repository's Node 26 runtime. Obtain the resource monitors through the current native build/release workflow; cached matching native helpers are reusable after checking provenance and architecture. This does not permit substituting an upstream server executable. When internal disk space is low, put the release and temporary directories on the connected external SSD. Keep a release's archives on disk until its desktop package has been verified. The helper targets the current Mac arm64 installation; inspect and adapt the desktop target when updating a different host.

Install the verified app at `/Applications/T3 Code (Local).app` only when authorized by the update request and safe with respect to active work. Preserve a rollback copy, stage and validate the replacement before moving it into place, and restore the previous app if replacement fails. Keep Local data intact. Do not push, create a PR, or write a handoff unless separately requested.

For an unsigned personal build, apply an ad hoc signature to the staged app with `codesign --force --deep --sign - <staged-app>` and verify it with `codesign --verify --deep --strict <staged-app>` before replacement. Production distribution follows the repository's signing workflow. Launch with `ELECTRON_RUN_AS_NODE` unset; that variable makes Electron print its Node version instead of starting T3. Check the installed Local version in `Contents/Info.plist`, the embedded package manifest, and the running server descriptor.

## Verify the installed runtime

Read back the installed app's full version, bundled archive names and hashes, and executable identity. When a remote update is authorized and will not interrupt active work, use the app's supported SSH runtime installation flow and supported `t3 service install` for boot persistence. The fork runtime is installed immutably under `~/.t3/runtime/versions/<full-version>`; confirm the actual remote process PID, executable path and hash, full version, and the user systemd unit's effective executable and enabled/active state. Check that the running process is the intended fork build, not merely that a health endpoint responds. Inspect service logs for errors without exposing secrets.

Confirm token data from a real Pi turn reaches the client, including token usage and speed. If a real turn or safe service activation cannot be performed, report that limitation and leave the update unverified; do not claim completion. Report upstream revision, Local version and source revision, installed paths and runtime identity, checks and their results, rollback location, and any remaining verification or restart needed.
