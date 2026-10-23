import type {
  ModelSelection,
  ProviderInstanceId,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { BotIcon, PencilRulerIcon } from "lucide-react";
import { type ComponentProps, memo } from "react";

import { cn } from "~/lib/utils";
import type { ContextWindowSnapshot } from "../../lib/contextWindow";
import { Select, SelectItem, SelectPopup, SelectValue } from "../ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  ComposerControl,
  ComposerControlIcon,
  ComposerControlSeparator,
  type ComposerControlSize,
  ComposerSelectControl,
} from "./ComposerControl";
import { useComposerMenuProps } from "./composerEventScope";
import { ComposerPrimaryActions } from "./ComposerPrimaryActions";
import { ContextWindowMeter, ContextWindowMeterPlaceholder } from "./ContextWindowMeter";
import { resolveModelPickerSelectedModel } from "./ModelPickerContent";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { runtimeModeConfig } from "./runtimeModeConfig";
import { useComposerMenuState } from "./useComposerMenuState";

export type RuntimeModeOption = { mode: RuntimeMode } & (typeof runtimeModeConfig)[RuntimeMode];
const supervisedRuntimeModeOption = {
  mode: "approval-required" as const,
  ...runtimeModeConfig["approval-required"],
};
export const ComposerFooterModeControls = memo(function ComposerFooterModeControls(props: {
  showInteractionModeToggle: boolean;
  interactionMode: ProviderInteractionMode;
  runtimeMode: RuntimeMode;
  runtimeModeOptions: ReadonlyArray<RuntimeModeOption>;
  size?: "sm" | "xs";
  hidden?: boolean;
  onToggleInteractionMode: () => void;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}) {
  const size = props.size ?? "sm";
  const composerFloatingLayerProps = useComposerMenuProps();
  const [open, setOpen] = useComposerMenuState(props.hidden);
  const runtimeModeOption =
    props.runtimeModeOptions.find((option) => option.mode === props.runtimeMode) ??
    supervisedRuntimeModeOption;
  const RuntimeModeIcon = runtimeModeOption.icon;
  const interactionModeTooltip =
    props.interactionMode === "plan"
      ? "Plan mode. Click to return to normal build mode"
      : "Default mode. Click to enter plan mode";

  const interactionModeToggle = props.showInteractionModeToggle ? (
    <>
      <ComposerControlSeparator size={size} />
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerControl
              size={size}
              className="shrink-0 whitespace-nowrap"
              aria-pressed={props.interactionMode === "plan"}
              type="button"
              onClick={props.onToggleInteractionMode}
              aria-label={interactionModeTooltip}
            />
          }
        >
          {props.interactionMode === "plan" ? (
            <ComposerControlIcon
              icon={PencilRulerIcon}
              size={size}
              className="text-current opacity-100"
            />
          ) : (
            <ComposerControlIcon
              icon={BotIcon}
              size={size}
              opticalSize={size === "xs" ? "default" : "large"}
            />
          )}
          <span data-composer-control-label className="sr-only sm:not-sr-only">
            {props.interactionMode === "plan" ? "Plan" : "Build"}
          </span>
        </TooltipTrigger>
        <TooltipPopup side="top">{interactionModeTooltip}</TooltipPopup>
      </Tooltip>
    </>
  ) : null;

  return (
    <>
      <ComposerControlSeparator size={size} />

      <Tooltip>
        <Select
          open={open}
          onOpenChange={setOpen}
          value={props.runtimeMode}
          onValueChange={(value) => props.onRuntimeModeChange(value!)}
        >
          <TooltipTrigger
            render={
              <ComposerSelectControl
                data-composer-shortcut="composer.mode"
                size={size}
                aria-label="Runtime mode"
              />
            }
          >
            <ComposerControlIcon icon={RuntimeModeIcon} size={size} />
            <SelectValue data-composer-control-label>{runtimeModeOption.label}</SelectValue>
          </TooltipTrigger>
          <SelectPopup alignItemWithTrigger={false} {...composerFloatingLayerProps}>
            {props.runtimeModeOptions.map((option) => {
              const OptionIcon = option.icon;
              return (
                <SelectItem
                  key={option.mode}
                  value={option.mode}
                  hideIndicator
                  className="min-w-64"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        <OptionIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        {option.label}
                      </span>
                      <span className="text-muted-foreground text-xs leading-4">
                        {option.description}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              );
            })}
          </SelectPopup>
        </Select>
        <TooltipPopup side="top">{runtimeModeOption.description}</TooltipPopup>
      </Tooltip>

      {interactionModeToggle}
    </>
  );
});

export const ComposerUsageControls = memo(function ComposerUsageControls(props: {
  size: ComposerControlSize;
  hidden: boolean;
  activeContextWindow: ContextWindowSnapshot | null;
  contextWindowMeterEnabled: boolean;
  completedTurnTokensPerSecond: number | null;
  reserveContextWindowMeter: boolean;
  activeThreadModelDisplayName: string | null;
  onCompactContext?: (() => void) | undefined;
  compactDisabled: boolean;
  compactDisabledReason: string | null;
}) {
  return (
    <div data-resting-controls-usage className="flex shrink-0 items-center gap-1">
      {props.contextWindowMeterEnabled ? (
        <>
          <ComposerControlSeparator size={props.size} />
          {!props.activeContextWindow && props.reserveContextWindowMeter ? (
            <ContextWindowMeterPlaceholder size={props.size} />
          ) : (
            <ContextWindowMeter
              size={props.size}
              hidden={props.hidden}
              usage={props.activeContextWindow}
              modelDisplayName={props.activeThreadModelDisplayName}
              onCompact={props.onCompactContext}
              compactDisabled={props.compactDisabled}
              compactDisabledReason={props.compactDisabledReason}
            />
          )}
        </>
      ) : null}
      <ComposerControlSeparator size={props.size} />
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              className={cn(
                "inline-flex shrink-0 items-center whitespace-nowrap rounded-sm font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                props.size === "xs" ? "h-7 text-2xs sm:h-6" : "h-7 text-xs",
                props.completedTurnTokensPerSecond === null
                  ? "text-muted-foreground"
                  : "text-success-foreground",
              )}
            />
          }
        >
          {props.completedTurnTokensPerSecond === null
            ? "-"
            : props.completedTurnTokensPerSecond > 0 && props.completedTurnTokensPerSecond < 0.1
              ? "<0.1"
              : props.completedTurnTokensPerSecond.toLocaleString("en-US", {
                  maximumFractionDigits: 1,
                })}{" "}
          tok/s
        </TooltipTrigger>
        <TooltipPopup side="top">
          {props.completedTurnTokensPerSecond === null
            ? "Available after a completed turn reports output tokens and timing."
            : "Average output tokens per second for the latest completed turn, including reasoning, tool calls, and waiting. Updates when a turn completes."}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
});

export const ComposerFooterPrimaryActions = memo(function ComposerFooterPrimaryActions(props: {
  compact: boolean;
  canOperateThread: boolean;
  isPreparingWorktree: boolean;
  pendingAction: {
    questionIndex: number;
    isLastQuestion: boolean;
    canAdvance: boolean;
    isResponding: boolean;
    isComplete: boolean;
  } | null;
  isRunning: boolean;
  canInterrupt: boolean;
  followUpBehavior: "queue" | "steer";
  canSteer: boolean;
  alternateShortcutLabel: string | null;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  sendDisabledReason: string | null;
  isConnecting: boolean;
  isEnvironmentUnavailable: boolean;
  hasSendableContent: boolean;
  canResume: boolean;
  preserveComposerFocusOnPointerDown?: boolean;
  isEditingQueuedMessage: boolean;
  onSubmitMessage: React.MouseEventHandler<HTMLButtonElement>;
  onResume: () => void;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
  compactBeforeSendTokens: number | null;
  keepFullHistory: boolean;
  onToggleKeepFullHistory: () => void;
}) {
  return (
    <ComposerPrimaryActions
      compact={props.compact}
      canOperateThread={props.canOperateThread}
      pendingAction={props.pendingAction}
      isRunning={props.isRunning}
      canInterrupt={props.canInterrupt}
      followUpBehavior={props.followUpBehavior}
      canSteer={props.canSteer}
      alternateShortcutLabel={props.alternateShortcutLabel}
      showPlanFollowUpPrompt={props.showPlanFollowUpPrompt}
      promptHasText={props.promptHasText}
      isSendBusy={props.isSendBusy}
      sendDisabledReason={props.sendDisabledReason}
      isConnecting={props.isConnecting}
      isEnvironmentUnavailable={props.isEnvironmentUnavailable}
      isPreparingWorktree={props.isPreparingWorktree}
      hasSendableContent={props.hasSendableContent}
      canResume={props.canResume}
      preserveComposerFocusOnPointerDown={props.preserveComposerFocusOnPointerDown ?? false}
      isEditingQueuedMessage={props.isEditingQueuedMessage}
      onSubmitMessage={props.onSubmitMessage}
      onResume={props.onResume}
      onPreviousPendingQuestion={props.onPreviousPendingQuestion}
      onInterrupt={props.onInterrupt}
      onImplementPlanInNewThread={props.onImplementPlanInNewThread}
      compactBeforeSendTokens={props.compactBeforeSendTokens}
      keepFullHistory={props.keepFullHistory}
      onToggleKeepFullHistory={props.onToggleKeepFullHistory}
    />
  );
});

/**
 * The composer's model picker. It owns the single- and multi-model selection
 * handlers so they are cached against the selection state, not rebuilt on
 * every ChatComposer render.
 */
export function ComposerModelPicker({
  multipleModelsEnabled,
  multipleModelSelections,
  onMultipleModelSelectionsChange,
  selectedModelSelection,
  onProviderModelSelect,
  ...pickerProps
}: Omit<
  ComponentProps<typeof ProviderModelPicker>,
  "selectedModels" | "onToggleModel" | "onInstanceModelChange"
> & {
  readonly multipleModelsEnabled: boolean;
  readonly multipleModelSelections: ReadonlyArray<ModelSelection> | null;
  readonly onMultipleModelSelectionsChange: (
    selections: ReadonlyArray<ModelSelection> | null,
  ) => void;
  readonly selectedModelSelection: ModelSelection;
  readonly onProviderModelSelect: (
    instanceId: ProviderInstanceId,
    model: string,
    options?: { focusComposer?: boolean },
  ) => void;
}) {
  const { instanceEntries, modelOptionsByInstance } = pickerProps;
  const toggleModel = (instanceId: ProviderInstanceId, model: string) => {
    const current = multipleModelSelections ?? [selectedModelSelection];
    const matchesModel = (selection: ModelSelection) => {
      if (selection.instanceId !== instanceId) return false;
      const entry = instanceEntries.find((entry) => entry.instanceId === selection.instanceId);
      const resolvedModel = resolveModelPickerSelectedModel({
        driverKind: entry?.driverKind,
        model: selection.model,
        options: modelOptionsByInstance?.get(selection.instanceId) ?? [],
      });
      return (resolvedModel?.slug ?? selection.model) === model;
    };
    const exists = current.some(matchesModel);
    const next = exists
      ? current.filter((selection) => !matchesModel(selection))
      : [...current, createModelSelection(instanceId, model)];
    if (next.length > 1) {
      onMultipleModelSelectionsChange(next);
    } else {
      onMultipleModelSelectionsChange(null);
      const remaining = next[0] ?? selectedModelSelection;
      onProviderModelSelect(remaining.instanceId, remaining.model, {
        focusComposer: false,
      });
    }
  };
  return (
    <ProviderModelPicker
      {...pickerProps}
      {...(multipleModelsEnabled
        ? {
            ...(multipleModelSelections !== null
              ? { selectedModels: multipleModelSelections }
              : {}),
            onToggleModel: toggleModel,
          }
        : {})}
      onInstanceModelChange={(instanceId, model) => {
        onMultipleModelSelectionsChange(null);
        onProviderModelSelect(instanceId, model);
      }}
    />
  );
}
