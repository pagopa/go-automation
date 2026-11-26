import type { KnownCase, StepDescriptor } from '../../../engine/index.js';
import { findUnwiredKnownCaseStepRef } from '../../../engine/internal.js';

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
 * Fail-fast on custom step descriptor ids that are duplicated or collide
 * with the canonical pipeline.
 *
 * @param ctx - Builder and runbook under validation
 * @param descriptors - Custom steps declared by the runbook author
 * @param reservedStepIds - Ids already occupied by the pipeline or another hook
 * @param descriptorLabel - Human-readable hook name used in error messages
 * @returns The declared custom step ids
 */
export function assertStepDescriptorIds(
  ctx: AlarmConfigValidationContext,
  descriptors: ReadonlyArray<StepDescriptor> | undefined,
  reservedStepIds: ReadonlySet<string>,
  descriptorLabel: string,
): ReadonlySet<string> {
  const seen = new Set<string>();
  for (const descriptor of descriptors ?? []) {
    const stepId = descriptor.step.id;
    if (seen.has(stepId)) {
      failAlarmConfig(ctx, `${descriptorLabel} id "${stepId}" is declared more than once.`);
    }
    seen.add(stepId);
    if (reservedStepIds.has(stepId)) {
      failAlarmConfig(ctx, `${descriptorLabel} id "${stepId}" collides with a reserved pipeline step id.`);
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
  const unwired = findUnwiredKnownCaseStepRef(knownCases, wiredStepIds);
  if (unwired === undefined) return;
  failAlarmConfig(
    ctx,
    `knownCase "${unwired.caseId}" references step "${unwired.stepId}" which is not wired in this runbook${hint}`,
  );
}
