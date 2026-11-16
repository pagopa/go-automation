import type { KnownCase } from '../types/KnownCase.js';
import { collectConditionStepRefs } from './collectConditionStepRefs.js';
import type { UnwiredStepRef } from './UnwiredStepRef.js';

/**
 * First known case whose condition references a step the runbook never wires.
 *
 * A typo, or a case written for another pipeline, leaves a condition that can
 * never match; builders turn the result into their own configuration error.
 *
 * @param knownCases - Cases declared by the runbook author
 * @param wiredStepIds - Ids the assembled pipeline actually contains
 * @returns The first unwired reference, in declaration order, or `undefined`
 */
export function findUnwiredKnownCaseStepRef(
  knownCases: ReadonlyArray<KnownCase>,
  wiredStepIds: ReadonlySet<string>,
): UnwiredStepRef | undefined {
  for (const knownCase of knownCases) {
    for (const stepId of collectConditionStepRefs(knownCase.condition)) {
      if (!wiredStepIds.has(stepId)) return { caseId: knownCase.id, stepId };
    }
  }
  return undefined;
}
