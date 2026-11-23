import type {
  ContextWindowBreakdown,
  ContextWindowSnapshot,
} from "@t3tools/client-runtime/state/context-window";
import { useGT } from "gt-react";

import { formatContextWindowTokens } from "~/lib/contextWindow";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";

export interface ContextWindowDetails {
  readonly usage: ContextWindowSnapshot;
  readonly breakdown: ContextWindowBreakdown;
  readonly activity: { readonly turns: number; readonly tools: number };
}

export function formatContextPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value > 0 && value < 0.1) return "<0.1%";
  if (value < 10) return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  return `${Math.round(value)}%`;
}

/** Cached prompt, then uncached context, over the whole window; a tick marks auto-compaction. */
export function ContextWindowBar(props: {
  readonly details: Pick<ContextWindowDetails, "usage" | "breakdown">;
  readonly className?: string;
  readonly showCompactionTick?: boolean;
}) {
  const { usage, breakdown } = props.details;
  const used = Math.max(0, Math.min(100, usage.usedPercentage ?? 0));
  const nearlyFull = used > 90;
  const cached = nearlyFull ? 0 : Math.min(used, breakdown.cachedPercentage ?? 0);
  const rest = used - cached;
  const threshold = usage.autoCompactThreshold;
  const tick =
    props.showCompactionTick &&
    threshold != null &&
    usage.maxTokens != null &&
    threshold > 0 &&
    threshold < usage.maxTokens
      ? (threshold / usage.maxTokens) * 100
      : null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex overflow-visible rounded-full bg-muted-foreground/20",
        props.className,
      )}
    >
      <span className="flex h-full w-full overflow-hidden rounded-full">
        {cached > 0 ? <span className="h-full bg-info" style={{ width: `${cached}%` }} /> : null}
        {rest > 0 ? (
          <span
            className={cn(
              "h-full",
              nearlyFull
                ? "bg-error"
                : breakdown.cachedTokens === null
                  ? "bg-muted-foreground"
                  : "bg-warning",
            )}
            style={{ width: `max(${rest}%, 2px)` }}
          />
        ) : null}
      </span>
      {tick !== null ? (
        <span
          className="absolute -top-[2px] -bottom-[2px] w-px -translate-x-1/2 bg-foreground/60"
          style={{ left: `${tick}%` }}
        />
      ) : null}
    </span>
  );
}

function BreakdownRow(props: {
  readonly swatch: string;
  readonly label: string;
  readonly tokens: number | null;
  readonly percentage: number | null;
}) {
  return (
    <div className="contents">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-sm", props.swatch)} />
        {props.label}
      </dt>
      <dd className="text-right font-medium text-foreground tabular-nums">
        {props.tokens === null ? "-" : formatContextWindowTokens(props.tokens)}
      </dd>
      <dd className="text-right text-muted-foreground tabular-nums">
        {formatContextPercentage(props.percentage) ?? ""}
      </dd>
    </div>
  );
}

/** The context window's usage split, prompt-cache health, and a way to compact it. */
export function ContextWindowBreakdownCard(props: {
  readonly details: ContextWindowDetails;
  readonly onCompact?: (() => void) | undefined;
  readonly compactDisabled?: boolean;
}) {
  const gt = useGT();
  const { usage, breakdown, activity } = props.details;
  const usedPercentage = formatContextPercentage(usage.usedPercentage);
  const hit = formatContextPercentage(breakdown.promptCacheHitPercentage);
  const average = formatContextPercentage(breakdown.averagePromptCacheHitPercentage);
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-1">
        <div className="font-medium text-muted-foreground">{gt("Context")}</div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold text-base text-foreground tabular-nums">
            {usedPercentage !== null
              ? gt("{percentage} used", { percentage: usedPercentage })
              : formatContextWindowTokens(usage.usedTokens)}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {formatContextWindowTokens(usage.usedTokens)}
            {usage.maxTokens != null ? ` / ${formatContextWindowTokens(usage.maxTokens)}` : null}
          </span>
        </div>
      </div>
      {usage.usedPercentage !== null ? (
        <ContextWindowBar details={props.details} className="h-2.5 w-full" showCompactionTick />
      ) : null}
      <dl className="grid grid-cols-[1fr_auto_3.5rem] items-center gap-x-3 gap-y-1.5">
        {breakdown.cachedTokens !== null ? (
          <>
            <BreakdownRow
              swatch="bg-info"
              label={gt("Cached context")}
              tokens={breakdown.cachedTokens}
              percentage={breakdown.cachedPercentage}
            />
            <BreakdownRow
              swatch="bg-warning"
              label={gt("Uncached context")}
              tokens={breakdown.uncachedTokens}
              percentage={breakdown.uncachedPercentage}
            />
          </>
        ) : null}
        {breakdown.freeTokens !== null ? (
          <BreakdownRow
            swatch="border border-muted-foreground/50"
            label={gt("Free space")}
            tokens={breakdown.freeTokens}
            percentage={breakdown.freePercentage}
          />
        ) : null}
      </dl>
      {hit !== null || average !== null ? (
        <div className="flex items-center justify-between gap-3 border-border border-t pt-2.5">
          <span className="text-muted-foreground">{gt("Prompt cache")}</span>
          <span className="tabular-nums">
            {hit !== null ? <span className="font-medium text-info-foreground">{hit}</span> : null}
            {hit !== null && average !== null ? (
              <span className="text-muted-foreground"> · </span>
            ) : null}
            {average !== null ? (
              <span className="text-muted-foreground">
                {gt("avg {percentage}", { percentage: average })}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-border border-t pt-2.5">
        <span className="text-muted-foreground tabular-nums">
          {gt(
            "{turns, plural, one {{turns} turn} other {{turns} turns}} · {tools, plural, one {{tools} tool} other {{tools} tools}}",
            { turns: activity.turns, tools: activity.tools },
          )}
        </span>
        {props.onCompact ? (
          <Button
            size="compact"
            variant="ghost"
            disabled={props.compactDisabled}
            onClick={props.onCompact}
          >
            {gt("Compact", { $context: "verb, compact history before sending" })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
