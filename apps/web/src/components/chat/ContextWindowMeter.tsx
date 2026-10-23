import { Button } from "../ui/button";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import {
  formatContextWindowCompactionMessage,
  formatContextWindowCost,
} from "./ContextWindowMeter.logic";
import { Minimize2Icon } from "lucide-react";
import type { ComposerControlSize } from "./ComposerControl";
import { useComposerMenuState } from "./useComposerMenuState";
import { useComposerMenuProps } from "./composerEventScope";

function formatPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${Math.round(value)}%`;
}

export function ContextWindowMeter(props: {
  size?: ComposerControlSize;
  hidden?: boolean;
  usage: ContextWindowSnapshot | null;
  modelDisplayName?: string | null;
  onCompact?: (() => void) | undefined;
  compactDisabled?: boolean | undefined;
  compactDisabledReason?: string | null | undefined;
}) {
  const { usage, modelDisplayName, onCompact, compactDisabled, compactDisabledReason } = props;
  const size = props.size ?? "sm";
  const [open, setOpen] = useComposerMenuState(props.hidden);
  const composerMenuProps = useComposerMenuProps();
  const usedPercentage = formatPercentage(usage?.usedPercentage ?? null);
  const normalizedPercentage = Math.max(0, Math.min(100, usage?.usedPercentage ?? 0));
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - normalizedPercentage / 100);
  const usageColor =
    normalizedPercentage > 90
      ? "var(--color-error)"
      : "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)";
  const tokenRows = [
    { label: "Used", value: usage?.usedTokens },
    { label: "Maximum", value: usage?.maxTokens },
    { label: "Remaining", value: usage?.remainingTokens },
    { label: "Input", value: usage?.inputTokens },
    { label: "Cached input", value: usage?.cachedInputTokens },
    { label: "Output", value: usage?.outputTokens },
    { label: "Reasoning output", value: usage?.reasoningOutputTokens },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size={size === "xs" ? "icon-xs" : "icon-sm"}
            variant="ghost-muted"
            aria-label={
              usedPercentage !== null
                ? `Context window ${usedPercentage} used. Show breakdown`
                : usage !== null
                  ? `Context window ${formatContextWindowTokens(usage.usedTokens)} tokens used. Show breakdown`
                  : "Context window not reported yet. Show breakdown"
            }
          >
            <span
              className={`relative flex items-center justify-center ${size === "xs" ? "size-4" : "size-5"}`}
            >
              <svg
                viewBox="0 0 24 24"
                className="-rotate-90 absolute inset-0 size-full transform-gpu mx-0!"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  className="stroke-muted-foreground/24"
                  strokeWidth="3"
                  strokeDasharray={usedPercentage === null ? "2 3" : undefined}
                />
                {usedPercentage !== null ? (
                  <circle
                    cx="12"
                    cy="12"
                    r={radius}
                    fill="none"
                    stroke={usageColor}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
                  />
                ) : null}
              </svg>
            </span>
          </Button>
        }
      />
      <PopoverPopup
        {...composerMenuProps}
        tooltipStyle
        side="top"
        align="end"
        padding="none"
        width="sm"
        aria-label="Context window breakdown"
        className="text-left whitespace-normal"
      >
        <div className="flex flex-col gap-2 p-(--floating-content-inset)">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-muted-foreground text-xs">Context window</div>
            {usedPercentage !== null ? (
              <div className="text-secondary-label text-2xs tabular-nums">{usedPercentage}</div>
            ) : null}
          </div>
          {usage === null ? (
            <p className="text-secondary-label text-2xs leading-4">
              Context usage has not been reported yet. Counts appear when the provider reports them.
            </p>
          ) : (
            <>
              {usedPercentage !== null ? (
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(normalizedPercentage)}
                  aria-label="Context window usage"
                >
                  <div
                    className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${normalizedPercentage}%`, backgroundColor: usageColor }}
                  />
                </div>
              ) : null}
              <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 text-2xs leading-4 text-secondary-label">
                {tokenRows.map(({ label, value }) => (
                  <div key={label} className="contents">
                    <dt>{label}</dt>
                    <dd className="text-right font-medium tabular-nums">
                      {value == null ? "Not reported" : value.toLocaleString("en-US")}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-pretty text-secondary-label text-2xs leading-4">
                Cached input is included in input. Reasoning is included in output. Reported token
                counts may cover the latest request rather than the entire conversation.
              </p>
              {usage.totalProcessedTokens != null && usage.totalProcessedTokens > 0 ? (
                <div className="flex items-center justify-between gap-3 text-2xs leading-4 text-secondary-label">
                  <span>Total processed</span>
                  <span className="font-medium tabular-nums">
                    {formatContextWindowTokens(usage.totalProcessedTokens)}
                  </span>
                </div>
              ) : null}
              {usage.cost != null ? (
                <div className="flex items-center justify-between gap-3 text-2xs leading-4 text-secondary-label">
                  <span>Cost</span>
                  <span className="font-medium tabular-nums">
                    {formatContextWindowCost(usage.cost)}
                  </span>
                </div>
              ) : null}
              {usage.compactsAutomatically ? (
                <div className="mt-1 text-pretty text-secondary-label text-2xs font-medium">
                  {formatContextWindowCompactionMessage(
                    modelDisplayName,
                    usage.autoCompactThreshold,
                  )}
                </div>
              ) : null}
            </>
          )}
          {onCompact ? (
            <>
              <div className="mt-1">
                <Button
                  size="xs"
                  variant="outline"
                  className="w-full"
                  disabled={compactDisabled}
                  onClick={onCompact}
                >
                  <Minimize2Icon aria-hidden="true" />
                  Compact context
                </Button>
              </div>
              {compactDisabled && compactDisabledReason ? (
                <div className="text-pretty text-secondary-label text-2xs">
                  {compactDisabledReason}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

export function ContextWindowMeterPlaceholder({ size = "sm" }: { size?: ComposerControlSize }) {
  return (
    <span
      aria-hidden="true"
      className={size === "xs" ? "size-7 shrink-0 sm:size-6" : "size-8 shrink-0 sm:size-7"}
    />
  );
}
