import { useGT } from "gt-react";
import { formatContextWindowTokens } from "~/lib/contextWindow";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ComposerControl, type ComposerControlSize } from "./ComposerControl";
import { useComposerMenuState } from "./useComposerMenuState";
import { useComposerMenuProps } from "./composerEventScope";
import {
  ContextWindowBar,
  ContextWindowBreakdownCard,
  formatContextPercentage,
  type ContextWindowDetails,
} from "./ContextWindowBreakdown";

export function ContextWindowMeter(props: {
  size?: ComposerControlSize;
  hidden?: boolean;
  details: ContextWindowDetails | null;
  onCompact?: (() => void) | undefined;
  compactDisabled?: boolean;
}) {
  const gt = useGT();
  const { details } = props;
  const usage = details?.usage ?? null;
  const size = props.size ?? "sm";
  const [open, setOpen] = useComposerMenuState(props.hidden);
  const composerMenuProps = useComposerMenuProps();
  const usedPercentage = formatContextPercentage(usage?.usedPercentage ?? null);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <ComposerControl
              size={size}
              aria-label={
                usedPercentage !== null
                  ? gt("Context window {percentage} used. Show breakdown", {
                      percentage: usedPercentage,
                    })
                  : usage !== null
                    ? gt("Context window {tokens} tokens used. Show breakdown", {
                        tokens: formatContextWindowTokens(usage.usedTokens),
                      })
                    : gt("Context window not reported yet. Show breakdown")
              }
            >
              <span data-composer-control-label className="text-muted-foreground">
                {gt("ctx", { $context: "short label for context window usage" })}
              </span>
              {details !== null && usage?.usedPercentage != null ? (
                <ContextWindowBar
                  details={details}
                  className={`shrink-0 ${size === "xs" ? "h-1 w-8" : "h-1.5 w-10"}`}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className={`shrink-0 rounded-full border border-dashed border-muted-foreground/40 ${size === "xs" ? "h-1 w-8" : "h-1.5 w-10"}`}
                />
              )}
              <span data-composer-control-label className="tabular-nums">
                {usage !== null ? (
                  <>
                    {formatContextWindowTokens(usage.usedTokens)}
                    {usage.maxTokens != null
                      ? `/${formatContextWindowTokens(usage.maxTokens)}`
                      : null}{" "}
                  </>
                ) : null}
                <span className="text-muted-foreground">{usedPercentage ?? "-"}</span>
              </span>
            </ComposerControl>
          }
        />
        <PopoverPopup
          {...composerMenuProps}
          tooltipStyle
          side="top"
          align="center"
          padding="none"
          width="sm"
          aria-label={gt("Context window breakdown")}
          className="text-left whitespace-normal"
        >
          <div className="p-(--floating-content-inset)">
            {details !== null ? (
              <ContextWindowBreakdownCard
                details={details}
                onCompact={
                  props.onCompact
                    ? () => {
                        setOpen(false);
                        props.onCompact?.();
                      }
                    : undefined
                }
                compactDisabled={props.compactDisabled ?? false}
              />
            ) : (
              <div className="text-muted-foreground text-xs">
                {gt("Context window not reported yet.")}
              </div>
            )}
          </div>
        </PopoverPopup>
      </Popover>
    </div>
  );
}

export function ContextWindowMeterPlaceholder({ size = "sm" }: { size?: ComposerControlSize }) {
  return (
    <span
      aria-hidden="true"
      className={size === "xs" ? "h-7 w-36 shrink-0 sm:h-6" : "h-8 w-44 shrink-0 sm:h-7"}
    />
  );
}
