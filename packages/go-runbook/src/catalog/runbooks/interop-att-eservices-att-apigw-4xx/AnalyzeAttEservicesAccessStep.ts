import { readRowField, type ResultField } from '@go-automation/go-common/aws';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { readStepOutput } from '../../../steps/data/readStepOutput.js';
import {
  ACCESS_LOG_RESULT_LIMIT,
  ANALYSIS_STEP_ID,
  API_GW_ID,
  API_GW_LOG_GROUP,
  DOCUMENTED_PROBE_PATHS,
  QUERY_STEP_ID,
} from './alarmDefinition.js';

export interface AttEservicesAccessAnalysis {
  readonly requestCount: number;
  readonly documentedProbeCount: number;
  readonly allDocumentedProbes: boolean;
  readonly coverageLimited: boolean;
  readonly paths: ReadonlyArray<string>;
  readonly statusCounts: Readonly<Record<string, number>>;
}

/** Recognize the documented 403 context per request, without attributing other errors to a backend. */
export class AnalyzeAttEservicesAccessStep implements Step<AttEservicesAccessAnalysis> {
  readonly id: string = ANALYSIS_STEP_ID;
  readonly label: string = 'Analisi richieste 4xx e-services in Attestazione';
  readonly kind: StepKind = 'transform';

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<AttEservicesAccessAnalysis>> {
    const upstream = readStepOutput<ReadonlyArray<ReadonlyArray<ResultField>>>(context, QUERY_STEP_ID);
    if (!upstream.ok) return upstream.failure;
    const rows = upstream.value;
    const paths = new Set<string>();
    const statusCounts = new Map<string, number>();
    let documentedProbeCount = 0;
    for (const row of rows) {
      const status = readRowField(row, 'status') ?? '';
      const path = readRowField(row, 'requestPath') ?? '';
      const key = /^\d{3}$/u.test(status) ? status : 'unknown';
      statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
      if (path !== '') paths.add(path);
      if (
        readRowField(row, 'apigwId') === API_GW_ID &&
        status === '403' &&
        readRowField(row, 'httpMethod') === 'GET' &&
        readRowField(row, 'integrationStatus') === '-' &&
        readRowField(row, 'integrationError') === '-' &&
        DOCUMENTED_PROBE_PATHS.has(path)
      )
        documentedProbeCount++;
    }
    // A result at the declared query ceiling cannot establish coverage of the whole window.
    const coverageLimited = rows.length >= ACCESS_LOG_RESULT_LIMIT;
    const allDocumentedProbes = rows.length > 0 && !coverageLimited && documentedProbeCount === rows.length;
    const output: AttEservicesAccessAnalysis = {
      requestCount: rows.length,
      documentedProbeCount,
      allDocumentedProbes,
      coverageLimited,
      paths: [...paths].sort(),
      statusCounts: Object.fromEntries(statusCounts),
    };
    const pathSummary = output.paths.slice(0, 10).join(', ');
    context.services.reporter.add({
      label: `Richieste 4xx e-services: ${String(rows.length)}; richieste 403 documentate: ${String(documentedProbeCount)}`,
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
        attEservicesProbeCount: String(documentedProbeCount),
        attEservicesAllDocumentedProbes: String(allDocumentedProbes),
        attEservicesCoverageLimited: String(coverageLimited),
        attEservicesPaths: pathSummary,
        attEservicesRequestSummary: `${String(documentedProbeCount)} richieste 403 documentate su ${String(rows.length)} richieste 4xx. Path osservati: ${pathSummary}`,
      },
    };
  }
}
