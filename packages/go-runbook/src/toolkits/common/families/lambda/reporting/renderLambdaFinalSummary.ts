import type { GOLogger } from '@pagopa/go-common/logging';
import type { LambdaTerminationReason } from '../types/LambdaTerminationReason.js';
import { LambdaReporter } from './LambdaReporter.js';
import { ConsoleRunbookReporter } from '../../../../../engine/reporting/ConsoleRunbookReporter.js';
import type { RunbookExecutionStatus } from '../../../../../engine/types/RunbookExecutionStatus.js';
import { renderExecutionFailureSummary } from '../../../output/renderExecutionFailureSummary.js';

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

  const terminationReason = readVar(input.vars, 'terminationReason') as LambdaTerminationReason | '';
  const downstreamTarget = readVar(input.vars, 'lambdaDownstreamTarget');
  const errorMessage = readVar(input.vars, 'lastErrorMsg');
  const category = readVar(input.vars, 'lambdaErrorCategory');
  const requestId = readVar(input.vars, 'lambdaRequestId');

  const reason: LambdaTerminationReason =
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
