import type { CaseAction } from '../actions/CaseAction.js';
import { AthenaQueryStep } from '../steps/data/AthenaQueryStep.js';
import { CloudWatchMetricsStep } from '../steps/data/CloudWatchMetricsStep.js';
import { DynamoDBGetStep } from '../steps/data/DynamoDBGetStep.js';
import { DynamoDBQueryStep } from '../steps/data/DynamoDBQueryStep.js';
import type { Runbook } from '../types/Runbook.js';
import type { Step } from '../types/Step.js';

/**
 * Data sources the cloud worker cannot read in the occurrence's account.
 *
 * In cloud the worker holds credentials for the monitoring account and reaches
 * the source account through an OAM link. OAM shares telemetry, not
 * credentials: CloudWatch Logs follows it because its queries name log groups
 * by ARN, while these services would answer from the monitoring account —
 * successfully, with the wrong data. They are refused up front.
 */
function oamUnreachableService(step: Step): string | undefined {
  if (step instanceof DynamoDBQueryStep || step instanceof DynamoDBGetStep) return 'DynamoDB';
  if (step instanceof AthenaQueryStep) return 'Athena';
  if (step instanceof CloudWatchMetricsStep) return 'CloudWatch Metrics';
  return undefined;
}

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

  for (const descriptor of runbook.steps) {
    const service = oamUnreachableService(descriptor.step);
    if (service !== undefined) {
      throw new Error(
        `Runbook "${runbook.metadata.id}" reads ${service} in step "${descriptor.step.id}", ` +
          'which the cloud worker cannot reach in the source account: OAM shares telemetry, not credentials',
      );
    }
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
