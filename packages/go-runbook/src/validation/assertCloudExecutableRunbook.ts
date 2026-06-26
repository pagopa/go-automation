import type { CaseAction } from '../actions/CaseAction.js';
import type { Runbook } from '../types/Runbook.js';

/** Rejects runbooks that are not explicitly read-only for cloud execution. */
export function assertCloudExecutableRunbook(runbook: Runbook): void {
  if (runbook.cloudExecutionPolicy?.sideEffects !== 'NONE') {
    throw new Error(`Runbook "${runbook.metadata.id}" does not declare cloud sideEffects=NONE`);
  }

  const mutationStep = runbook.steps.find((descriptor) => descriptor.step.kind === 'mutation');
  if (mutationStep !== undefined) {
    throw new Error(
      `Runbook "${runbook.metadata.id}" contains mutation step "${mutationStep.step.id}" and cannot run in cloud v1`,
    );
  }

  for (const knownCase of runbook.knownCases) {
    assertReadOnlyAction(runbook.metadata.id, knownCase.action);
  }
  assertReadOnlyAction(runbook.metadata.id, runbook.fallbackAction);
}

function assertReadOnlyAction(runbookId: string, action: CaseAction): void {
  if (action.type === 'log') {
    return;
  }
  if (action.type === 'composite') {
    for (const nested of action.actions) {
      assertReadOnlyAction(runbookId, nested);
    }
    return;
  }
  throw new Error(`Runbook "${runbookId}" contains cloud side-effect action "${action.type}"`);
}
