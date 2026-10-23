import { describe, expect, it } from "vite-plus/test";
import { OrchestrationV2ProviderTurnTokenUsage } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { formatContextWindowCompactionMessage } from "../components/chat/ContextWindowMeter.logic";
import * as DateTime from "effect/DateTime";
import {
  ContextTransferId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  RunId,
  ThreadId,
  type OrchestrationV2ProviderTurn,
} from "@t3tools/contracts";
import { makeThreadProjectionFixture } from "../test-fixtures";
import { shouldOfferResumeCompaction } from "../components/chat/ContextWindowMeter.logic";
import {
  deriveLatestContextWindowSnapshot,
  latestCompletedTurnTokensPerSecond,
  latestProviderTurnTokenUsage,
} from "./contextWindow";

const decodeTokenUsage = Schema.decodeSync(OrchestrationV2ProviderTurnTokenUsage);

describe("latestCompletedTurnTokensPerSecond", () => {
  const activeId = ProviderThreadId.make("active");
  const completeUsage = {
    usageStatus: "complete",
    usageScope: "main_agent",
    inputTokens: 1_000,
    outputTokens: 50,
    reasoningTokens: 20,
    hasSubagents: false,
  } satisfies OrchestrationV2ProviderTurn["turnTokenUsage"];
  function turn(overrides: Partial<OrchestrationV2ProviderTurn> = {}) {
    return {
      providerThreadId: activeId,
      ordinal: 1,
      status: "completed",
      startedAt: DateTime.makeUnsafe("2026-10-20T12:00:00Z"),
      completedAt: DateTime.makeUnsafe("2026-10-20T12:00:10Z"),
      turnTokenUsage: completeUsage,
      ...overrides,
    } satisfies Pick<
      OrchestrationV2ProviderTurn,
      "providerThreadId" | "ordinal" | "status" | "startedAt" | "completedAt" | "turnTokenUsage"
    >;
  }

  it("uses normalized output including reasoning once, rather than the last API request", () => {
    expect(
      latestCompletedTurnTokensPerSecond(
        [
          turn({
            tokenUsage: { usedTokens: 1_005, outputTokens: 5, updatedAt: "2026-10-20T12:00:10Z" },
          }),
        ],
        activeId,
      ),
    ).toBe(5);
  });

  it("keeps the previous completed turn while a new one is running", () => {
    expect(
      latestCompletedTurnTokensPerSecond(
        [turn(), turn({ ordinal: 2, status: "running", completedAt: null })],
        activeId,
      ),
    ).toBe(5);
  });

  it("selects the newest completed ordinal regardless of snapshot order", () => {
    expect(
      latestCompletedTurnTokensPerSecond(
        [turn({ ordinal: 2, completedAt: DateTime.makeUnsafe("2026-10-20T12:00:20Z") }), turn()],
        activeId,
      ),
    ).toBe(2.5);
  });

  it("does not carry rates across active provider threads or forks", () => {
    const otherId = ProviderThreadId.make("other");
    const turns = [turn({ ordinal: 10 }), turn({ providerThreadId: otherId, status: "running" })];
    expect(latestCompletedTurnTokensPerSecond(turns, activeId)).toBe(5);
    expect(latestCompletedTurnTokensPerSecond(turns, otherId)).toBeNull();
    expect(latestCompletedTurnTokensPerSecond(turns, null)).toBeNull();
    expect(latestCompletedTurnTokensPerSecond([], activeId)).toBeNull();
  });

  it.each([
    { startedAt: null },
    { completedAt: null },
    { completedAt: DateTime.makeUnsafe("2026-10-20T12:00:00Z") },
    { completedAt: DateTime.makeUnsafe("2026-10-20T11:59:59Z") },
    { status: "failed" },
    { status: "interrupted" },
    { status: "cancelled" },
  ] satisfies Partial<OrchestrationV2ProviderTurn>[])(
    "rejects invalid timing or status: %o",
    (overrides) => {
      expect(latestCompletedTurnTokensPerSecond([turn(overrides)], activeId)).toBeNull();
    },
  );

  it.each(["partial", "unavailable"] as const)("does not estimate from %s usage", (usageStatus) => {
    const latest = turn({
      ordinal: 2,
      turnTokenUsage: { ...completeUsage, usageStatus },
    });
    expect(latestCompletedTurnTokensPerSecond([turn(), latest], activeId)).toBeNull();
  });

  it("requires normalized turn usage even when live request usage exists", () => {
    const { turnTokenUsage: _, ...withoutUsage } = turn({
      tokenUsage: { usedTokens: 1_005, outputTokens: 5, updatedAt: "2026-10-20T12:00:10Z" },
    });
    expect(latestCompletedTurnTokensPerSecond([withoutUsage], activeId)).toBeNull();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "handles an output count of %s honestly",
    (outputTokens) => {
      expect(
        latestCompletedTurnTokensPerSecond(
          [turn({ turnTokenUsage: { ...completeUsage, outputTokens } })],
          activeId,
        ),
      ).toBe(outputTokens === 0 ? 0 : null);
    },
  );
});

describe("V2 context window presentation", () => {
  it("uses retained compaction token data when available", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      {
        item: {
          id: "compaction-1" as never,
          threadId: "thread-1" as never,
          runId: null,
          nodeId: null,
          providerThreadId: null,
          providerTurnId: null,
          nativeItemRef: null,
          parentItemId: null,
          ordinal: 1,
          status: "completed",
          title: null,
          startedAt: null,
          completedAt: null,
          updatedAt: DateTime.makeUnsafe("2026-06-20T00:00:00.000Z"),
          type: "compaction",
          driver: null,
          beforeTokenCount: 10_000,
          afterTokenCount: 2_000,
        },
      },
    ]);
    expect(snapshot?.usedTokens).toBe(2_000);
    expect(snapshot?.totalProcessedTokens).toBe(10_000);
  });
});

describe("live provider-turn usage (#8144)", () => {
  it("prefers the provider's live report over compaction items", () => {
    const usage = decodeTokenUsage({
      usedTokens: 42_000,
      maxTokens: 200_000,
      inputTokens: 40_000,
      outputTokens: 2_000,
      autoCompactThreshold: 150_000,
      updatedAt: "2026-08-27T00:00:00.000Z",
    });
    const snapshot = deriveLatestContextWindowSnapshot([], usage);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.usedTokens).toBe(42_000);
    expect(snapshot?.maxTokens).toBe(200_000);
    expect(snapshot?.remainingTokens).toBe(158_000);
    expect(snapshot?.usedPercentage).toBe(21);
    expect(snapshot?.autoCompactThreshold).toBe(150_000);
    expect(
      formatContextWindowCompactionMessage("Claude Sonnet 4.6", snapshot?.autoCompactThreshold),
    ).toBe("Compacts automatically at about 150,000 tokens.");
  });
});

describe("latestProviderTurnTokenUsage", () => {
  it("picks the newest report, not the last turn in snapshot order", () => {
    const usage = (usedTokens: number, updatedAt: string) => ({
      tokenUsage: { usedTokens, updatedAt },
    });
    const latest = latestProviderTurnTokenUsage([
      usage(300_000, "2026-06-20T12:00:00.000Z"),
      {},
      usage(90_000, "2026-06-20T09:00:00.000Z"),
    ]);
    expect(latest?.usedTokens).toBe(300_000);
  });

  const sourceUsage = {
    usedTokens: 513_000,
    maxTokens: 1_000_000,
    promptCacheTtlMs: 5 * 60_000,
    updatedAt: "2026-10-19T12:00:00.000Z",
  };
  function forkProjection() {
    const projection = makeThreadProjectionFixture();
    const sourceThreadId = ThreadId.make("parent");
    const runId = RunId.make("fork-point");
    return {
      thread: {
        ...projection.thread,
        forkedFrom: { type: "run" as const, threadId: sourceThreadId, runId },
      },
      contextTransfers: [
        {
          id: ContextTransferId.make("fork-transfer"),
          type: "fork" as const,
          sourceThreadId,
          targetThreadId: projection.thread.id,
          sourcePoint: { threadId: sourceThreadId, runId },
          basePoint: null,
          sourceProviderInstanceId: projection.thread.modelSelection.instanceId,
          sourceTokenUsage: sourceUsage,
          targetProviderInstanceId: null,
          targetRunId: null,
          status: "pending" as const,
          resolution: null,
          createdBy: "user" as const,
          error: null,
          createdAt: projection.updatedAt,
          updatedAt: projection.updatedAt,
          consumedAt: null,
        },
      ],
    };
  }

  it("keeps fork-point context and its cache expiry before the fork reports usage", () => {
    const usage = latestProviderTurnTokenUsage([], forkProjection());
    expect(usage).toEqual(sourceUsage);
    const snapshot = deriveLatestContextWindowSnapshot([], usage);
    expect(snapshot?.usedTokens).toBe(513_000);
    expect(
      shouldOfferResumeCompaction({
        provider: "claudeAgent",
        usedTokens: snapshot?.usedTokens,
        updatedAt: snapshot?.updatedAt,
        promptCacheTtlMs: usage?.promptCacheTtlMs,
        now: "2026-10-19T12:06:00.000Z",
      }),
    ).toBe(true);
  });

  it("replaces inherited usage with the fork's own report", () => {
    const tokenUsage = { usedTokens: 42_000, updatedAt: "2026-10-19T12:10:00.000Z" };
    expect(latestProviderTurnTokenUsage([{ tokenUsage }], forkProjection())).toEqual(tokenUsage);
  });

  it.each([0, 42_000])(
    "prefers target provider-thread usage of %d tokens over inherited usage",
    (usedTokens) => {
      const providerThread = {
        contextUsage: {
          usedTokens,
          maxTokens: 200_000,
          cost: { amount: 0.42, currency: "USD" },
        },
        updatedAt: DateTime.makeUnsafe("2026-10-19T12:10:00.000Z"),
      };
      const usage = latestProviderTurnTokenUsage([], forkProjection(), providerThread);
      const snapshot = deriveLatestContextWindowSnapshot([], usage, providerThread);

      expect(snapshot).toMatchObject({
        usedTokens,
        maxTokens: 200_000,
        cost: { amount: 0.42, currency: "USD" },
        updatedAt: "2026-10-19T12:10:00.000Z",
      });
    },
  );

  it("keeps the fallback after a native fork is consumed", () => {
    const projection = forkProjection();
    const transfer = projection.contextTransfers[0]!;
    expect(
      latestProviderTurnTokenUsage([], {
        ...projection,
        contextTransfers: [
          {
            ...transfer,
            status: "consumed",
            resolution: {
              strategy: "native_fork",
              providerThreadRef: {
                driver: ProviderDriverKind.make("claudeAgent"),
                nativeId: "fork",
                strength: "strong",
              },
            },
          },
        ],
      }),
    ).toEqual(sourceUsage);
  });

  it("does not reuse usage for portable handoffs, different providers, or missing history", () => {
    const projection = forkProjection();
    const transfer = projection.contextTransfers[0]!;
    for (const contextTransfers of [
      [],
      [{ ...transfer, sourceTokenUsage: undefined }],
      [{ ...transfer, status: "resolved_portable" as const }],
      [{ ...transfer, sourceProviderInstanceId: ProviderInstanceId.make("other") }],
      [{ ...transfer, sourcePoint: { ...transfer.sourcePoint, runId: RunId.make("later") } }],
    ]) {
      expect(latestProviderTurnTokenUsage([], { ...projection, contextTransfers })).toBeNull();
    }
  });
});
