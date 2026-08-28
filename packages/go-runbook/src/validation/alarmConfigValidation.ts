import type { KnownCase } from '../types/KnownCase.js';
import type { StepDescriptor } from '../types/StepDescriptor.js';
import { collectConditionStepRefs } from './collectConditionStepRefs.js';

/**
 * Identifies the builder reporting a configuration problem, so every family
 * raises the same `createXxxAlarmRunbook "<id>": …` message shape.
 */
export interface AlarmConfigValidationContext {
  /** Name of the calling factory, e.g. `createLambdaAlarmRunbook`. */
  readonly builderName: string;
  /** Runbook id under validation. */
  readonly runbookId: string;
}

/**
 * Throws a configuration error attributed to the calling builder.
 *
 * @param ctx - Builder and runbook under validation
 * @param message - What is wrong, without the builder prefix
 */
export function failAlarmConfig(ctx: AlarmConfigValidationContext, message: string): never {
  throw new Error(`${ctx.builderName} "${ctx.runbookId}": ${message}`);
}

/**
 * Fail-fast on preStep ids that are duplicated or collide with the pipeline's
 * own ids, before the builder wires a runbook whose steps shadow each other.
 *
 * @param ctx - Builder and runbook under validation
 * @param preSteps - Custom steps declared by the runbook author
 * @param reservedStepIds - Ids the family's canonical pipeline occupies
 * @returns The declared preStep ids, for further family-specific checks
 */
export function assertPreStepIds(
  ctx: AlarmConfigValidationContext,
  preSteps: ReadonlyArray<StepDescriptor> | undefined,
  reservedStepIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const seen = new Set<string>();
  for (const descriptor of preSteps ?? []) {
    const stepId = descriptor.step.id;
    if (seen.has(stepId)) {
      failAlarmConfig(ctx, `preStep id "${stepId}" is declared more than once.`);
    }
    seen.add(stepId);
    if (reservedStepIds.has(stepId)) {
      failAlarmConfig(ctx, `preStep id "${stepId}" collides with a reserved pipeline step id.`);
    }
  }
  return seen;
}

/**
 * Fail-fast when a known case references a step this runbook never wires.
 *
 * Catches the typo and the "case written for another profile" mistake at
 * build time, instead of leaving a condition that can never match.
 *
 * @param ctx - Builder and runbook under validation
 * @param knownCases - Cases declared by the runbook author
 * @param wiredStepIds - Ids the assembled pipeline actually contains
 * @param hint - Family-specific tail appended to the error message
 */
export function assertKnownCaseStepRefs(
  ctx: AlarmConfigValidationContext,
  knownCases: ReadonlyArray<KnownCase>,
  wiredStepIds: ReadonlySet<string>,
  hint: string,
): void {
  for (const knownCase of knownCases) {
    for (const stepId of collectConditionStepRefs(knownCase.condition)) {
      if (wiredStepIds.has(stepId)) continue;
      failAlarmConfig(
        ctx,
        `knownCase "${knownCase.id}" references step "${stepId}" which is not wired in this runbook${hint}`,
      );
    }
  }
}
