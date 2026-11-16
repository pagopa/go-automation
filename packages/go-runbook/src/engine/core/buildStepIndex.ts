import type { StepDescriptor } from '../types/StepDescriptor.js';

/**
 * Builds a `stepId → position` index over a step descriptor list.
 *
 * Used by the engine to resolve `goTo` flow directives to an array index
 * in O(1) instead of scanning the descriptor list per jump.
 *
 * @param stepDescriptors - The ordered step descriptors of a runbook.
 * @returns A map from step id to its 0-based position.
 */
export function buildStepIndex(stepDescriptors: ReadonlyArray<StepDescriptor>): ReadonlyMap<string, number> {
  const stepIndex = new Map<string, number>();
  for (let i = 0; i < stepDescriptors.length; i++) {
    const descriptor = stepDescriptors[i];
    if (descriptor !== undefined) {
      stepIndex.set(descriptor.step.id, i);
    }
  }
  return stepIndex;
}
