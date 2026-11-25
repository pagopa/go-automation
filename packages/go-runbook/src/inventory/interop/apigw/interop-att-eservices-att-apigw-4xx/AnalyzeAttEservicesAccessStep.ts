import type { CloudWatchLogsRows } from '../../../../toolkits/interop/index.js';
import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import {
  readStepOutput,
  type RunbookContext,
  type Step,
  type StepKind,
  type StepResult,
} from '../../../../engine/index.js';
import {
  ACCESS_LOG_RESULT_LIMIT,
  ANALYSIS_STEP_ID,
  API_GW_ID,
  API_GW_LOG_GROUP,
  QUERY_STEP_ID,
} from './alarmDefinition.js';

export interface AttEservicesAccessAnalysis {
  readonly requestCount: number;
  readonly rejectedBeforeIntegrationCount: number;
  readonly allRejectedBeforeIntegration: boolean;
  readonly coverageLimited: boolean;
  readonly paths: ReadonlyArray<string>;
  readonly statusCounts: Readonly<Record<string, number>>;
}

/** Recognize, per request, the 403 that API Gateway returned without calling the integration. */
export class AnalyzeAttEservicesAccessStep implements Step<AttEservicesAccessAnalysis> {
  readonly id: string = ANALYSIS_STEP_ID;
  readonly label: string = 'Analisi richieste 4xx e-services in Attestazione';
  readonly kind: StepKind = 'transform';

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<AttEservicesAccessAnalysis>> {
    const upstream = readStepOutput<CloudWatchLogsRows>(context, QUERY_STEP_ID);
    if (!upstream.ok) return upstream.failure;
    const rows = upstream.value;
    const paths = new Set<string>();
    const statusCounts = new Map<string, number>();
    let rejectedBeforeIntegrationCount = 0;
    for (const row of rows) {
      const status = readRowField(row, 'status') ?? '';
      const path = readRowField(row, 'requestPath') ?? '';
      const key = /^\d{3}$/u.test(status) ? status : 'unknown';
      statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
      if (path !== '') paths.add(path);
      if (
        readRowField(row, 'apigwId') === API_GW_ID &&
        status === '403' &&
        path !== '' &&
        readRowField(row, 'integrationStatus') === '-' &&
        readRowField(row, 'integrationError') === '-'
      )
        rejectedBeforeIntegrationCount++;
    }
    // A result at the declared query ceiling cannot establish coverage of the whole window.
    const coverageLimited = rows.length >= ACCESS_LOG_RESULT_LIMIT;
    const allRejectedBeforeIntegration =
      rows.length > 0 && !coverageLimited && rejectedBeforeIntegrationCount === rows.length;
    const output: AttEservicesAccessAnalysis = {
      requestCount: rows.length,
      rejectedBeforeIntegrationCount,
      allRejectedBeforeIntegration,
      coverageLimited,
      paths: [...paths].sort(),
      statusCounts: Object.fromEntries(statusCounts),
    };
    const pathSummary = output.paths.slice(0, 10).join(', ');
    context.services.reporter.add({
      label: `Richieste 4xx e-services: ${String(rows.length)}; richieste 403 senza integrazione: ${String(rejectedBeforeIntegrationCount)}`,
    });
    return {
      success: true,
      output,
      vars: {
        interopEnvironment: 'att',
        interopApiGwId: API_GW_ID,
        interopApiGwLogGroup: API_GW_LOG_GROUP,
        apiGwErrorCount: String(rows.length),
        attEservicesRequestCount: String(rows.length),
        attEservicesRejectedCount: String(rejectedBeforeIntegrationCount),
        attEservicesAllRejectedBeforeIntegration: String(allRejectedBeforeIntegration),
        attEservicesCoverageLimited: String(coverageLimited),
        attEservicesPaths: pathSummary,
        attEservicesRequestSummary: `${String(rejectedBeforeIntegrationCount)} richieste 403 senza integrazione su ${String(rows.length)} richieste 4xx. Path osservati: ${pathSummary}`,
      },
    };
  }
}
