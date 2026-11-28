import type { KnownError } from '../types/KnownError.js';
import { collectConditionStepRefs } from './collectConditionStepRefs.js';
import type { UnwiredStepRef } from './UnwiredStepRef.js';

/**
 * First known error whose condition references a step the runbook never wires.
 *
 * A typo, or a case written for another pipeline, leaves a condition that can
 * never match; builders turn the result into their own configuration error.
 *
 * @param knownErrors - Cases declared by the runbook author
 * @param wiredStepIds - Ids the assembled pipeline actually contains
 * @returns The first unwired reference, in declaration order, or `undefined`
 */
export function findUnwiredKnownErrorStepRef(
  knownErrors: ReadonlyArray<KnownError>,
  wiredStepIds: ReadonlySet<string>,
): UnwiredStepRef | undefined {
  for (const knownError of knownErrors) {
    for (const stepId of collectConditionStepRefs(knownError.condition)) {
      if (!wiredStepIds.has(stepId)) return { knownErrorCode: knownError.code, stepId };
    }
  }
  return undefined;
}
