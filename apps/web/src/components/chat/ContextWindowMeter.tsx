import { Button } from "../ui/button";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
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
}) {
  const { usage } = props;
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
  ];

  return (
    <div className="flex shrink-0 items-center gap-1">
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
          align="center"
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
          </div>
        </PopoverPopup>
      </Popover>
      <span
        className={`tabular-nums text-muted-foreground ${size === "xs" ? "text-2xs" : "text-xs"}`}
      >
        {usedPercentage ?? "-"}
      </span>
    </div>
  );
}

export function ContextWindowMeterPlaceholder({ size = "sm" }: { size?: ComposerControlSize }) {
  return (
    <span
      aria-hidden="true"
      className={size === "xs" ? "h-7 w-14 shrink-0 sm:h-6" : "h-8 w-16 shrink-0 sm:h-7"}
    />
  );
}
