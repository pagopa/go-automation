import type { GOLogger } from '@go-automation/go-common/core';
import type { TerminationReason } from '../types/TerminationReason.js';
import { LambdaReporter } from './LambdaReporter.js';

/**
 * Input expected by {@link renderLambdaFinalSummary}. The consumer script
 * collects these from the engine result so the closing banner reflects the
 * real outcome of the runbook. Mirrors `apigw.ApiGwFinalSummaryInput`.
 */
export interface LambdaFinalSummaryInput {
  readonly logger: GOLogger;
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
  const terminationReason = readVar(input.vars, 'terminationReason') as TerminationReason | '';
  const downstreamTarget = readVar(input.vars, 'lambdaDownstreamTarget');
  const errorMessage = readVar(input.vars, 'lastErrorMsg');
  const category = readVar(input.vars, 'lambdaErrorCategory');
  const requestId = readVar(input.vars, 'lambdaRequestId');

  const reason: TerminationReason =
    input.matchedCaseIds.length > 0 ? 'known-case' : terminationReason !== '' ? terminationReason : 'no-match';

  new LambdaReporter(input.logger).stopSummary({
    reason,
    matchedCaseIds: input.matchedCaseIds,
    ...(category !== '' ? { category } : {}),
    ...(downstreamTarget !== '' ? { downstreamTarget } : {}),
    ...(errorMessage !== '' ? { errorMessage } : {}),
    ...(requestId !== '' ? { requestId } : {}),
  });
}
