import type { CaseAction, Runbook, Step, TreeLevelReader } from '../../../engine/index.js';
import { collectRunbookSteps } from '../../../engine/index.js';
import type { OperationalServiceName } from '../services/OperationalServiceName.js';

/** The services of {@link oamUnreachableService}, by registry name, with the name the error gives them. */
const OAM_UNREACHABLE_SERVICES: ReadonlyMap<string, string> = new Map<OperationalServiceName, string>([
  ['dynamodb', 'DynamoDB'],
  ['athena', 'Athena'],
  ['cloudWatchMetrics', 'CloudWatch Metrics'],
]);

/**
 * Data sources the cloud worker cannot read in the occurrence's account.
 *
 * In cloud the worker holds credentials for the monitoring account and reaches
 * the source account through an OAM link. OAM shares telemetry, not
 * credentials: CloudWatch Logs follows it because its queries name log groups
 * by ARN, while these services would answer from the monitoring account —
 * successfully, with the wrong data. They are refused up front.
 */
function oamUnreachableService(step: Step | TreeLevelReader): string | undefined {
  for (const name of step.requiredServices?.() ?? []) {
    const service = OAM_UNREACHABLE_SERVICES.get(name);
    if (service !== undefined) return service;
  }
  return undefined;
}

/** Rejects runbooks that are not explicitly read-only for cloud execution. */
export function assertCloudExecutableRunbook(runbook: Runbook): void {
  if (runbook.cloudExecutionPolicy?.sideEffects !== 'NONE') {
    throw new Error(`Runbook "${runbook.metadata.id}" does not declare cloud sideEffects=NONE`);
  }

  // Every executable step: pipeline, error tree and the steps of the actions.
  const steps = collectRunbookSteps(runbook);
  const mutationStep = steps.find((step) => step.kind === 'mutation');
  if (mutationStep !== undefined) {
    throw new Error(
      `Runbook "${runbook.metadata.id}" contains mutation step "${mutationStep.id}" and cannot run in cloud v1`,
    );
  }

  for (const step of steps) {
    const service = oamUnreachableService(step);
    if (service !== undefined) {
      throw new Error(
        `Runbook "${runbook.metadata.id}" reads ${service} in step "${step.id}", ` +
          'which the cloud worker cannot reach in the source account: OAM shares telemetry, not credentials',
      );
    }
  }

  for (const knownError of runbook.knownErrors) {
    assertReadOnlyAction(runbook.metadata.id, knownError.action);
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
