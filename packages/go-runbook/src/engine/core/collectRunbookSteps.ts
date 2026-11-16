import type { CaseAction } from '../types/CaseAction.js';
import type { Runbook } from '../types/Runbook.js';
import type { Step } from '../types/Step.js';

/**
 * Every step a runbook can execute: the pipeline, the steps nested in control
 * steps (`nestedSteps()`), and the steps of the actions of every known case and
 * of the fallback, composite actions included (EVO-RBREORG-OPUS-01 §7.1.3 A,
 * RBREORG-08). Used by the service check of the engine and by the cloud policy.
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
  for (const knownCase of runbook.knownCases) visitAction(knownCase.action);
  visitAction(runbook.fallbackAction);
  return [...seen];
}
