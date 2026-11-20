import type { CaseAction } from '../types/CaseAction.js';
import type { Runbook } from '../types/Runbook.js';
import type { Step } from '../types/Step.js';

/**
 * Every step a runbook can execute: the pipeline, the steps of the levels of its error tree, the steps nested in control
 * steps (`nestedSteps()`), and the steps of the actions of every known case and
 * of the fallback, composite actions included. Used by the service check of the engine and by the cloud policy.
 *
 * @param runbook - Runbook to visit
 * @returns The steps in visiting order, each instance once
 */
export function collectRunbookSteps(runbook: Runbook): ReadonlyArray<Step> {
  const seen = new Set<Step>();
  const visitStep = (step: Step): void => {
    if (seen.has(step)) return;
    seen.add(step);
    for (const nested of step.nestedSteps?.() ?? []) visitStep(nested);
  };
  const visitAction = (action: CaseAction): void => {
    switch (action.type) {
      case 'update':
        visitStep(action.step);
        return;
      case 'composite':
        for (const inner of action.actions) visitAction(inner);
        return;
      case 'log':
      case 'notify':
      case 'escalate':
        return;
      default: {
        const exhaustive: never = action;
        throw new Error(`Unknown case action: ${JSON.stringify(exhaustive)}`);
      }
    }
  };
  for (const descriptor of runbook.steps) visitStep(descriptor.step);
  // The levels of the error tree: their reads, per-node and after-descent steps.
  for (const level of runbook.tree === undefined ? [] : [runbook.tree.root, ...runbook.tree.levels]) {
    if (level.read !== undefined) visitStep(level.read);
    for (const descriptor of [...(level.perNode ?? []), ...(level.afterDescend ?? [])]) visitStep(descriptor.step);
  }
  for (const knownCase of runbook.knownCases) visitAction(knownCase.action);
  visitAction(runbook.fallbackAction);
  return [...seen];
}
