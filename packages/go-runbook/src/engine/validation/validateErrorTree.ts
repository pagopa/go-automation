import type { ErrorTreeDefinition } from '../types/ErrorTreeDefinition.js';
import type { StepDescriptor } from '../types/StepDescriptor.js';
import type { ValidationErrorEntry } from './ValidationErrorEntry.js';
import type { GoToReference } from './GoToGraphAnalyzer.js';

/** Collects the `goTo` references of a block of steps. */
export type GoToReferencesFn = (descriptors: ReadonlyArray<StepDescriptor>) => ReadonlyArray<GoToReference>;

/**
 * Validates the levels of an error tree against the steps of the window.
 *
 * - every level has a distinct target; every level but the root has a read with its attribution;
 * - the scoped steps are steps of the window;
 * - the step ids of the levels are unique in the runbook, the window included;
 * - a `goTo` of a per-node or after-descent block points inside its block, as at runtime.
 *
 * @param tree - Levels of the runbook
 * @param windowStepIds - Ids of the steps of the window
 * @param goToReferences - Collects the `goTo` references of a block
 * @returns The errors, empty when the tree is valid
 */
export function validateErrorTree(
  tree: ErrorTreeDefinition,
  windowStepIds: ReadonlySet<string>,
  goToReferences: GoToReferencesFn,
): ReadonlyArray<ValidationErrorEntry> {
  const errors: ValidationErrorEntry[] = [];
  const invalid = (message: string, stepId?: string): void => {
    errors.push({ code: 'INVALID_ERROR_TREE', message, ...(stepId !== undefined ? { stepId } : {}) });
  };

  const targets = new Set<string>();
  for (const level of [tree.root, ...tree.levels]) {
    if (targets.has(level.target)) invalid(`Error tree level "${level.target}" is declared twice.`);
    targets.add(level.target);
  }
  if (tree.root.read !== undefined) invalid(`The root level "${tree.root.target}" reads the window: it has no read.`);

  const seen = new Set(windowStepIds);
  for (const level of [tree.root, ...tree.levels]) {
    if (level !== tree.root && (level.read === undefined || level.attribute === undefined)) {
      invalid(`Error tree level "${level.target}" needs a read and the attribution of its rows.`);
    }
    for (const stepId of level.scopedSteps ?? []) {
      if (!windowStepIds.has(stepId))
        invalid(`Error tree level "${level.target}" scopes "${stepId}", not a step of the window.`, stepId);
    }
    // The scoped steps are steps of the window; every step the level declares is unique in the runbook.
    const declared = [
      ...(level.read !== undefined ? [level.read.id] : []),
      ...[...(level.perNode ?? []), ...(level.afterDescend ?? [])].map((descriptor) => descriptor.step.id),
    ];
    for (const stepId of declared) {
      if (seen.has(stepId)) invalid(`Duplicate step ID "${stepId}" in error tree level "${level.target}".`, stepId);
      seen.add(stepId);
    }
    for (const block of [level.perNode ?? [], level.afterDescend ?? []]) {
      const ids = new Set(block.map((descriptor) => descriptor.step.id));
      for (const reference of goToReferences(block)) {
        if (!ids.has(reference.targetId)) {
          invalid(
            `Step "${reference.sourceId}" of level "${level.target}" goes to "${reference.targetId}", outside its block.`,
            reference.sourceId,
          );
        }
      }
    }
  }
  return errors;
}
