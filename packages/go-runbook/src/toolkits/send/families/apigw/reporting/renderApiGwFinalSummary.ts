import { ConsoleRunbookReporter } from '../../../../../engine/reporting/ConsoleRunbookReporter.js';
import { renderExecutionFailureSummary } from '../../../../common/output/renderExecutionFailureSummary.js';
import type { ApiGwTerminationReason } from '../types/ApiGwTerminationReason.js';
import type { ApiGwFinalSummaryInput } from './ApiGwFinalSummaryInput.js';
import type { ApiGwReporterServiceSummary } from './ApiGwReporterServiceSummary.js';
import { ApiGwServiceChainReporter } from './ApiGwServiceChainReporter.js';

/**
 * Renders the closing "Esecuzione terminata" banner.
 *
 * Reads `terminationReason`, `downstreamTarget`, `lastErrorMsg` and
 * `apiGwServicesVisited` from the final context vars and combines them
 * with the engine's matched-case outputs (`matchedCaseIds`, derived
 * from the ordered `matchedCases` result and possibly empty) to
 * produce a banner that is always consistent with the runbook's real
 * outcome. When `matchedCaseIds` has more than one entry the banner
 * lists every matched case and tags `matchedCaseIds[0]` as primary
 * (the action of every matched case has already been executed in
 * priority desc order; only the primary action is executed by the engine).
 *
 * @param input - Fields collected from the engine result
 */
export function renderApiGwFinalSummary(input: ApiGwFinalSummaryInput): void {
  if (input.status !== 'completed') {
    renderExecutionFailureSummary(input.logger, input.status, input.failureReason);
    return;
  }

  const servicesVisited = parseVisitedChain(input.vars.get('apiGwServicesVisited'));
  const lastErrorMsg = (input.vars.get('lastErrorMsg') ?? '').trim();
  const terminationReason = (input.vars.get('terminationReason') ?? '').trim() as ApiGwTerminationReason | '';
  const downstreamTarget = (input.vars.get('downstreamTarget') ?? '').trim();

  // Fall back to the API Gateway evidence when no microservice produced
  // a representative error message: a 0-log entry service still leaves
  // useful information on the API GW row (`Endpoint request timed out`,
  // path, method) that we want to surface.
  const apiGwErrorMessage = sanitizeApiGwField(input.vars.get('apiGwErrorMessage'));
  const apiGwPath = sanitizeApiGwField(input.vars.get('apiGwPath'));
  const apiGwHttpMethod = sanitizeApiGwField(input.vars.get('apiGwHttpMethod'));

  let errorMessage = lastErrorMsg;
  if (errorMessage === '' && apiGwErrorMessage !== '') {
    const endpoint =
      apiGwHttpMethod !== '' && apiGwPath !== ''
        ? ` [${apiGwHttpMethod} ${apiGwPath}]`
        : apiGwPath !== ''
          ? ` [path: ${apiGwPath}]`
          : '';
    errorMessage = `${apiGwErrorMessage}${endpoint}`;
  }

  // The engine's matched cases win over the local decide-step verdict:
  // a known case may have matched on absence (e.g. `LogCount == '0'`)
  // even when decide had no positive signal to report.
  const reason: ApiGwTerminationReason =
    input.matchedCaseIds.length > 0 ? 'known-case' : terminationReason !== '' ? terminationReason : 'no-match';

  // Self-contained render outside the engine: owns its reporter and closes the
  // level itself, since no step will report after the summary.
  const summaryReporter = new ConsoleRunbookReporter(input.logger);
  new ApiGwServiceChainReporter(summaryReporter).stopSummary({
    reason,
    matchedCaseIds: input.matchedCaseIds,
    ...(downstreamTarget !== '' ? { downstreamTarget } : {}),
    ...(errorMessage !== '' ? { errorMessage } : {}),
    servicesVisited,
  });
  summaryReporter.flush();
}

/**
 * Trims and discards the literal `-` placeholder that API Gateway uses
 * for "field not present".
 */
function sanitizeApiGwField(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim();
  return trimmed === '-' ? '' : trimmed;
}

function parseVisitedChain(raw: string | undefined): ReadonlyArray<ApiGwReporterServiceSummary> {
  if (raw === undefined || raw.trim() === '') return [];
  const out: ApiGwReporterServiceSummary[] = [];
  for (const entry of raw.split(',')) {
    const [name, countStr] = entry.split('|');
    if (name === undefined || name === '') continue;
    const logCount = Number(countStr ?? '0');
    out.push({ name, logCount: Number.isFinite(logCount) ? logCount : 0 });
  }
  return out;
}
