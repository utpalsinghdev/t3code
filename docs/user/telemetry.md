# Product usage data

This Local fork disables external analytics and diagnostic reporting in its source. It does not
send product events to T3 Code's ingest endpoint or PostHog, account or device identifiers for
analytics, or relay and mobile connection traces to Axiom. Web client trace reporting is disabled.
Push notifications, Live Activities, and T3 Connect agent activity publishing remain available.

Server and desktop OpenTelemetry exports and endpoint checks are also disabled. Saved receiver
URLs, environment variables, and build-time tracing credentials cannot enable reporting in this
build. Local logs and resource diagnostics remain available.

For an older installed build, set these variables in the environment where its server runs:

```sh
export T3CODE_TELEMETRY_ENABLED=false
export T3CODE_OTEL_SDK_DISABLED=true
```

On macOS and Linux, the desktop app reads these variables from your shell profile, such as
`~/.zshrc`. Restart the app to apply them. Set them separately for remote servers. These variables
do not disable tracing built into an older mobile app or a separately hosted web app.

Disabling reporting does not block connections needed for features you use, such as provider
requests, T3 Connect, Git hosting, release checks, or external favicon requests. T3 Connect routes
connections through its hosted service. Use direct or SSH connections to avoid that service.
