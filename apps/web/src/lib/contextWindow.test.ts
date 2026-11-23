import { describe, expect, it } from "vite-plus/test";
import type { ThreadStructureTurnItem } from "@t3tools/client-runtime/state/shell";
import { OrchestrationV2ProviderTurnTokenUsage } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { formatContextWindowCompactionMessage } from "../components/chat/compaction.logic";
import * as DateTime from "effect/DateTime";
import {
  ContextTransferId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  RunId,
  ThreadId,
  type OrchestrationV2ProviderTurn,
} from "@t3tools/contracts";
import { makeThreadProjectionFixture } from "../test-fixtures";
import {
  advanceLiveTokenRateSample,
  deriveContextWindowBreakdown,
  deriveLatestContextWindowSnapshot,
  latestCompletedTurnTokensPerSecond,
  latestProviderTurnTokenUsage,
  shouldOfferResumeCompaction,
} from "@t3tools/client-runtime/state/context-window";

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

const compactionEntry = (providerThreadId: string | null) =>
  ({
    item: {
      id: "compaction-1" as never,
      threadId: "thread-1" as never,
      runId: null,
      nodeId: null,
      providerThreadId: providerThreadId as never,
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
  }) satisfies { item: ThreadStructureTurnItem };

describe("V2 context window presentation", () => {
  it("uses retained compaction token data when available", () => {
    const snapshot = deriveLatestContextWindowSnapshot([compactionEntry(null)]);
    expect(snapshot?.usedTokens).toBe(2_000);
    expect(snapshot?.totalProcessedTokens).toBe(10_000);
  });

  it("ignores a retired provider thread's compaction after a provider switch", () => {
    const activeProviderThread = {
      id: ProviderThreadId.make("acp-thread"),
      contextUsage: null,
      updatedAt: DateTime.makeUnsafe("2026-10-19T12:10:00.000Z"),
    };
    const retired = compactionEntry(ProviderThreadId.make("pi-thread"));
    const current = compactionEntry(ProviderThreadId.make("acp-thread"));
    expect(deriveLatestContextWindowSnapshot([retired], null, activeProviderThread)).toBeNull();
    expect(
      deriveLatestContextWindowSnapshot([current], null, activeProviderThread)?.usedTokens,
    ).toBe(2_000);
    // Items without a provider thread predate the split and stay visible.
    expect(
      deriveLatestContextWindowSnapshot([compactionEntry(null)], null, activeProviderThread)
        ?.usedTokens,
    ).toBe(2_000);
  });

  it("prefers a completed compaction over usage reported before it", () => {
    const usageBeforeCompaction = decodeTokenUsage({
      usedTokens: 985_000,
      maxTokens: 1_000_000,
      updatedAt: "2026-06-19T23:55:00.000Z",
    });
    const snapshot = deriveLatestContextWindowSnapshot(
      [compactionEntry(null)],
      usageBeforeCompaction,
    );
    expect(snapshot?.usedTokens).toBe(2_000);
    expect(snapshot?.maxTokens).toBe(1_000_000);

    // A report in the compaction's own millisecond is the provider's post-compaction usage.
    const reportedWithCompaction = decodeTokenUsage({
      usedTokens: 2_000,
      maxTokens: 1_000_000,
      autoCompactThreshold: 900_000,
      updatedAt: "2026-06-20T00:00:00.000Z",
    });
    expect(
      deriveLatestContextWindowSnapshot([compactionEntry(null)], reportedWithCompaction)
        ?.autoCompactThreshold,
    ).toBe(900_000);

    const { afterTokenCount: _, ...withoutCount } = compactionEntry(null).item;
    expect(
      deriveLatestContextWindowSnapshot([{ item: withoutCount }], usageBeforeCompaction),
    ).toBeNull();
    // A metadata-only provider thread update reports no usage, so an older count stays hidden.
    const olderCompaction = {
      item: {
        ...compactionEntry(null).item,
        updatedAt: DateTime.makeUnsafe("2026-06-19T00:00:00.000Z"),
      },
    };
    expect(
      deriveLatestContextWindowSnapshot([olderCompaction, { item: withoutCount }], null, {
        id: ProviderThreadId.make("thread"),
        contextUsage: null,
        updatedAt: DateTime.makeUnsafe("2026-06-21T00:00:00.000Z"),
      }),
    ).toBeNull();
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
    expect(formatContextWindowCompactionMessage(snapshot?.autoCompactThreshold)).toBe(
      "Compacts automatically at about 150,000 tokens.",
    );
  });
});

describe("latestProviderTurnTokenUsage", () => {
  it("picks the newest report, not the last turn in snapshot order", () => {
    const providerThreadId = ProviderThreadId.make("provider-thread");
    const usage = (usedTokens: number, updatedAt: string) => ({
      providerThreadId,
      tokenUsage: { usedTokens, updatedAt },
    });
    const latest = latestProviderTurnTokenUsage([
      usage(300_000, "2026-06-20T12:00:00.000Z"),
      { providerThreadId },
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
    expect(
      latestProviderTurnTokenUsage(
        [{ providerThreadId: ProviderThreadId.make("provider-thread"), tokenUsage }],
        forkProjection(),
      ),
    ).toEqual(tokenUsage);
  });

  it("prefers the active provider thread's older report over a newer retired one", () => {
    const turns = [
      {
        providerThreadId: ProviderThreadId.make("pi-thread"),
        tokenUsage: decodeTokenUsage({
          usedTokens: 180_000,
          maxTokens: 200_000,
          updatedAt: "2026-10-19T12:10:00.000Z",
        }),
      },
      {
        providerThreadId: ProviderThreadId.make("acp-thread"),
        tokenUsage: decodeTokenUsage({
          usedTokens: 12_000,
          maxTokens: 200_000,
          updatedAt: "2026-10-19T11:00:00.000Z",
        }),
      },
    ];
    const liveUsage = latestProviderTurnTokenUsage(turns, null, {
      id: ProviderThreadId.make("acp-thread"),
      contextUsage: null,
    });
    expect(liveUsage?.usedTokens).toBe(12_000);
  });

  it.each([0, 42_000])(
    "prefers target provider-thread usage of %d tokens over inherited usage",
    (usedTokens) => {
      const providerThread = {
        id: ProviderThreadId.make("provider-thread"),
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

describe("advanceLiveTokenRateSample", () => {
  const turnId = ProviderTurnId.make("turn-1");
  const running = (usedTokens: number, outputTokens: number, at: string, id = turnId) => ({
    id,
    providerThreadId: ProviderThreadId.make("active"),
    ordinal: 1,
    status: "running" as const,
    tokenUsage: { usedTokens, outputTokens, updatedAt: `2026-10-20T12:00:${at}Z` },
  });
  const advance = (...turns: ReadonlyArray<ReturnType<typeof running> | null>) =>
    turns.reduce(advanceLiveTokenRateSample, null);

  it("measures output growth within one request on the provider's clock", () => {
    expect(advance(running(1_001, 1, "00"))?.rate).toBeNull();
    expect(advance(running(1_001, 1, "00"), running(1_201, 201, "04"))?.rate).toBe(50);
  });

  it("starts a new request on a new prompt and keeps the last speed until it grows", () => {
    const sample = advance(
      running(1_001, 1, "00"),
      running(1_201, 201, "04"),
      running(1_401, 1, "10"),
    );
    expect(sample?.rate).toBe(50);
    expect(advanceLiveTokenRateSample(sample, running(1_431, 31, "11"))?.rate).toBe(30);
  });

  it("forgets the speed when the running turn ends or another turn starts", () => {
    const sample = advance(running(1_001, 1, "00"), running(1_201, 201, "04"));
    expect(advanceLiveTokenRateSample(sample, null)).toBeNull();
    expect(
      advanceLiveTokenRateSample(sample, running(1_001, 1, "05", ProviderTurnId.make("turn-2")))
        ?.rate,
    ).toBeNull();
  });
});

describe("deriveContextWindowBreakdown", () => {
  const activeId = ProviderThreadId.make("active");
  it("splits used context into cached and uncached prompt, with free space and cache hit rates", () => {
    const snapshot = deriveLatestContextWindowSnapshot(
      [],
      decodeTokenUsage({
        usedTokens: 443_000,
        maxTokens: 1_000_000,
        cachedInputTokens: 440_000,
        outputTokens: 1_000,
        updatedAt: "2026-10-20T12:00:00Z",
      }),
    )!;
    const breakdown = deriveContextWindowBreakdown(
      snapshot,
      [
        {
          providerThreadId: activeId,
          tokenUsage: decodeTokenUsage({
            usedTokens: 1_100,
            cachedInputTokens: 800,
            outputTokens: 100,
            updatedAt: "2026-10-20T11:00:00Z",
          }),
        },
        {
          providerThreadId: ProviderThreadId.make("retired"),
          tokenUsage: decodeTokenUsage({
            usedTokens: 1_000,
            cachedInputTokens: 0,
            updatedAt: "2026-10-20T10:00:00Z",
          }),
        },
        {
          providerThreadId: activeId,
          tokenUsage: decodeTokenUsage({ usedTokens: 1_000, updatedAt: "2026-10-20T09:00:00Z" }),
        },
      ],
      activeId,
    );
    expect(breakdown).toMatchObject({
      cachedTokens: 440_000,
      uncachedTokens: 3_000,
      freeTokens: 557_000,
      cachedPercentage: 44,
      uncachedPercentage: 0.3,
      freePercentage: 55.7,
      averagePromptCacheHitPercentage: 80,
    });
    expect(breakdown.promptCacheHitPercentage).toBeCloseTo(99.55, 2);
  });

  it("reports no cache split when the provider gave no cache counts", () => {
    const snapshot = deriveLatestContextWindowSnapshot([compactionEntry(null)])!;
    expect(deriveContextWindowBreakdown(snapshot, [], activeId)).toMatchObject({
      cachedTokens: null,
      uncachedTokens: null,
      promptCacheHitPercentage: null,
      averagePromptCacheHitPercentage: null,
    });
  });
});
