# Recover a Local SSH runtime update

Use this when Local reconnects repeatedly, reports that T3 Code on a saved SSH host did not answer, or uploads a runtime without activating that version. Preserve the previous runtime and live data. Recheck active work before any action that can release a queued stop or restart a server.

## Locate the failure

Distinguish the Mac's Local server from the saved SSH environment. Read their runtime descriptors and probe `/.well-known/t3/environment`; a responding local server does not prove that the remote connection works.

Check SSH access, the new pinned executable's `--version`, and the remote service state. Read the relevant SSH launch log under `<remote-T3-home>/ssh-launch/<state-key>/server.log` and the boot-service log. The desktop trace may show only an SSH exit code because the launch script redirects the service error to its remote log. Do not print pairing credentials or other secrets.

For Linux, inspect `systemctl --user show t3code.service` and `systemctl --user list-jobs`. A queued `stop` job that stays `waiting` while the service remains `active` is different from a server taking time to shut down. Repeating the installation can keep timing out without changing the running binary.

## Recover a stalled service-manager queue

After confirming that releasing the queued T3 stop will not interrupt unapproved active work:

1. Record the current T3 job ID. Cancel only that stale job and retry the supported pinned-runtime service installation once. Do not cancel unrelated jobs.
2. If the stop stays queued, inspect the other jobs and unit dependencies. Reload user-unit definitions with `systemctl --user daemon-reload` if appropriate.
3. If several jobs remain stuck without running and reloading did not recover dispatch, `systemctl --user daemon-reexec` can recover the user manager while preserving its running services. It can also release pending jobs, including the T3 stop, so check active work first. Do not restart or reboot the host as a shortcut.
4. Confirm the queued stop advances or completes, then use the new pinned executable's `service install --base-dir <remote-T3-home>`. If activation still fails, inspect the new error before retrying. Do not loop installations or escalate to force termination.

## Resolve a competing server

Other clients, including Beta, may reconnect during the switch and start an older SSH-managed server in the same T3 home. The new service can then fail with `ServerAlreadyRunningError` even though installation returned success.

Identify the actual owner from the runtime descriptor, listening port, executable, and service cgroup. Compare it with the launcher records under `ssh-launch/<state-key>/{pid,managed,port}`. Coordinate the switch so another client does not start an older runtime in the gap.

Use the application's managed-server stop path when available. A manual graceful stop is appropriate only for a confirmed SSH-managed server whose PID was recorded at launch, whose executable and T3 home still match, and whose work may be interrupted within the existing authorization. Wait for that exact process to exit, then restart the newly installed service. Never kill by a name/path pattern, guess a PID, force-kill it, remove ownership locks, or launch another server against the same live database.

## Prove recovery

Check the actual server process and descriptor again after activation. Both its version and executable hash must match the new bundled Local runtime; a correctly versioned launcher can coexist with an older server holding the port. Confirm the unit is enabled and active, has no pending stop job, and uses the intended launcher state.

Run the same desktop SSH launch path that failed and confirm it returns the expected port. Keep any host that does not pass these checks marked pending in the update report.
