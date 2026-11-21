import type { OrchestrationV2PlanStep } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

/** Pi tool whose results carry a full checklist snapshot (Codex-compatible arguments). */
export const PI_TODO_TOOL = "update_plan";

const PiTodoDetails = Schema.Struct({
  explanation: Schema.optional(Schema.String),
  plan: Schema.Array(
    Schema.Struct({
      step: Schema.String,
      status: Schema.Literals(["pending", "in_progress", "completed"]),
    }),
  ),
});

const decodePiTodoDetails = Schema.decodeUnknownOption(PiTodoDetails);

export interface PiTodoList {
  readonly steps: ReadonlyArray<OrchestrationV2PlanStep>;
  readonly explanation?: string;
}

/**
 * Reads an `update_plan` result's `details` into T3 plan steps.
 * Returns undefined for results that are not a valid checklist, so callers can
 * fall back to showing the ordinary tool item.
 */
export function decodePiTodoList(details: unknown, nativeId: string): PiTodoList | undefined {
  const decoded = Option.getOrUndefined(decodePiTodoDetails(details));
  if (decoded === undefined) return undefined;
  const steps = decoded.plan.map((item, index): OrchestrationV2PlanStep => ({
    id: `${nativeId}:${index + 1}`,
    text: item.step.trim() || `Step ${index + 1}`,
    status:
      item.status === "in_progress"
        ? "running"
        : item.status === "completed"
          ? "completed"
          : "pending",
  }));
  const explanation = decoded.explanation?.trim();
  return explanation ? { steps, explanation } : { steps };
}
