import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { EXTERNAL_REPORTING_ENABLED } from "@t3tools/shared/externalReporting";
import { DEFAULT_SIGNAL_EXPORT } from "@t3tools/shared/observability";
import * as OtelEnvironment from "@t3tools/shared/otelEnvironment";
import * as RelayTracing from "@t3tools/shared/relayTracing";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as ServerConfig from "../config.ts";
import { isAgentActivityPublishingEnabledValue } from "../cloud/config.ts";
import * as OtlpEndpointCheck from "../observability/OtlpEndpointCheck.ts";
import * as AnalyticsService from "./AnalyticsService.ts";

it.layer(NodeServices.layer)("Local reporting policy", (it) => {
  it.effect(
    "sends no analytics, owner reports, relay traces, or endpoint checks even when configured",
    () =>
      Effect.gen(function* () {
        const requests: Array<string> = [];
        const client = HttpClient.make((request) => {
          requests.push(request.url);
          return Effect.succeed(
            HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })),
          );
        });
        const reporting = Layer.mergeAll(
          AnalyticsService.layer,
          OtlpEndpointCheck.layer,
          RelayTracing.layer(
            {
              tracesUrl: "https://collector.example.test/v1/traces",
              tracesDataset: "test",
              tracesToken: "test-token",
            },
            { serviceName: "test", runtime: "node", serviceInstanceId: "test", client: "test" },
          ),
        ).pipe(
          Layer.provideMerge(
            ServerConfig.ServerConfig.layerTest(process.cwd(), {
              prefix: "t3-reporting-disabled-",
            }),
          ),
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(HttpClient.HttpClient, client),
              Layer.succeed(HostProcess.Platform, "darwin"),
              Layer.succeed(HostProcess.Architecture, "arm64"),
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({
                  T3CODE_TELEMETRY_ENABLED: true,
                  T3CODE_OTEL_SDK_DISABLED: false,
                  OTEL_SDK_DISABLED: false,
                }),
              ),
            ),
          ),
        );

        yield* Effect.gen(function* () {
          const analytics = yield* AnalyticsService.AnalyticsService;
          const check = yield* OtlpEndpointCheck.OtlpEndpointCheck;
          yield* analytics.record("provider.turn.completed", {
            inputTokens: 100,
            outputTokens: 50,
          });
          yield* analytics.record("feature.used", { feature: "terminal.open" });
          yield* analytics.recordOwners([{ source: "device", ownerId: "a".repeat(64) }], "client");
          yield* analytics.recordOwners([{ source: "openai", ownerId: "b".repeat(64) }], "server");
          yield* analytics.flush;
          yield* TestClock.adjust("1 minute");
          assert.deepEqual(
            yield* check.check({ signal: "logs", url: "https://collector.example.test/v1/logs" }),
            { _tag: "Rejected", status: 403 },
          );
          assert.isTrue(Option.isNone(yield* RelayTracing.RelayClientTracer));
        }).pipe(Effect.provide(reporting));

        assert.isFalse(EXTERNAL_REPORTING_ENABLED);
        assert.isTrue(isAgentActivityPublishingEnabledValue("true"));
        assert.deepEqual(requests, []);
      }),
  );
});

it.effect.each(["traces", "metrics", "logs"] as const)(
  "does not resolve %s exports from environment, bootstrap, or saved settings",
  (signal) =>
    Effect.gen(function* () {
      const otel = yield* OtelEnvironment.load.pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              T3CODE_OTEL_SDK_DISABLED: false,
              OTEL_SDK_DISABLED: false,
              OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.example.test",
            }),
          ),
        ),
      );
      for (const url of [undefined, "https://t3-collector.example.test"]) {
        assert.isUndefined(
          OtelEnvironment.resolveSignalEndpoint(
            otel,
            signal,
            { url, export: DEFAULT_SIGNAL_EXPORT },
            {
              bootstrapUrl: "https://bootstrap.example.test",
              settingsUrl: "https://settings.example.test",
            },
          ),
        );
        assert.isUndefined(
          OtelEnvironment.resolveSignalEndpoint(
            OtelEnvironment.none,
            signal,
            { url, export: DEFAULT_SIGNAL_EXPORT },
            { bootstrapUrl: undefined, settingsUrl: "https://settings.example.test" },
          ),
        );
      }
    }),
);
