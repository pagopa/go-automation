import type { CaseAction } from '../types/CaseAction.js';
import type { Runbook } from '../types/Runbook.js';
import type { Step } from '../types/Step.js';
import type { TreeLevelReader } from '../types/TreeLevelReader.js';
import { levelSteps } from '../tree/levelSteps.js';

/**
 * Every step a runbook can execute: the pipeline, the reads and steps of the levels of its error tree, and the steps
 * of the actions of every known case and of the fallback, composite actions included. Used by the service check of
 * the engine and by the cloud policy.
 *
 * @param runbook - Runbook to visit
 * @returns The steps and the reads in visiting order, each instance once
 */
export function collectRunbookSteps(runbook: Runbook): ReadonlyArray<Step | TreeLevelReader> {
  const seen = new Set<Step | TreeLevelReader>();
  const visitAction = (action: CaseAction): void => {
    switch (action.type) {
      case 'update':
        seen.add(action.step);
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
  for (const descriptor of runbook.steps) seen.add(descriptor.step);
  // The levels of the error tree: their reads, per-node and after-descent steps.
  for (const level of runbook.tree === undefined ? [] : [runbook.tree.root, ...runbook.tree.levels]) {
    if (level.read !== undefined) seen.add(level.read);
    for (const descriptor of levelSteps(level)) seen.add(descriptor.step);
  }
  for (const knownCase of runbook.knownCases) visitAction(knownCase.action);
  visitAction(runbook.fallbackAction);
  return [...seen];
}
