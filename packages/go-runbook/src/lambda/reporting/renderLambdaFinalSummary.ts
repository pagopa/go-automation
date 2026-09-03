import type { GOLogger } from '@go-automation/go-common/core';
import type { TerminationReason } from '../types/TerminationReason.js';
import { LambdaReporter } from './LambdaReporter.js';
import { ConsoleRunbookReporter } from '../../registry/reporters/ConsoleRunbookReporter.js';
import type { RunbookExecutionStatus } from '../../types/RunbookExecutionStatus.js';
import { renderExecutionFailureSummary } from '../../reporting/renderExecutionFailureSummary.js';

/**
 * Input expected by {@link renderLambdaFinalSummary}. The consumer script
 * collects these from the engine result so the closing banner reflects the
 * real outcome of the runbook. Mirrors `apigw.ApiGwFinalSummaryInput`.
 */
export interface LambdaFinalSummaryInput {
  readonly logger: GOLogger;
  /** Engine outcome: a run that did not complete has no diagnosis to report. */
  readonly status: RunbookExecutionStatus;
  /** Why the run stopped, when the engine recorded one. */
  readonly failureReason?: string;
  readonly matchedCaseIds: ReadonlyArray<string>;
  readonly vars: ReadonlyMap<string, string>;
}

function readVar(vars: ReadonlyMap<string, string>, name: string): string {
  return (vars.get(name) ?? '').trim();
}

/**
 * Renders the closing "Esecuzione terminata" banner for a Lambda runbook.
 *
 * @param input - Fields collected from the engine result
 */
export function renderLambdaFinalSummary(input: LambdaFinalSummaryInput): void {
  if (input.status !== 'completed') {
    renderExecutionFailureSummary(input.logger, input.status, input.failureReason);
    return;
  }

  const terminationReason = readVar(input.vars, 'terminationReason') as TerminationReason | '';
  const downstreamTarget = readVar(input.vars, 'lambdaDownstreamTarget');
  const errorMessage = readVar(input.vars, 'lastErrorMsg');
  const category = readVar(input.vars, 'lambdaErrorCategory');
  const requestId = readVar(input.vars, 'lambdaRequestId');

  const reason: TerminationReason =
    input.matchedCaseIds.length > 0 ? 'known-case' : terminationReason !== '' ? terminationReason : 'no-match';

  // Self-contained render outside the engine: owns its reporter and closes the
  // level itself, since no step will report after the summary.
  const reporter = new ConsoleRunbookReporter(input.logger);
  new LambdaReporter(reporter).stopSummary({
    reason,
    matchedCaseIds: input.matchedCaseIds,
    ...(category !== '' ? { category } : {}),
    ...(downstreamTarget !== '' ? { downstreamTarget } : {}),
    ...(errorMessage !== '' ? { errorMessage } : {}),
    ...(requestId !== '' ? { requestId } : {}),
  });
  reporter.flush();
}
