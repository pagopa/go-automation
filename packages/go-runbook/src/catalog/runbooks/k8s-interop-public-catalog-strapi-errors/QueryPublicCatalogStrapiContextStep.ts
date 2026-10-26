import { escapeLogsInsightsString, type ResultField } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepResult } from '../../../types/StepResult.js';
import { executeCloudWatchLogsQuery } from '../../../steps/data/executeCloudWatchLogsQuery.js';
import { executeStep } from '../../../steps/data/executeStep.js';
import { resolveTimeRange } from '../../../steps/data/resolveTimeRange.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;

/** Read startup and request context even when Strapi does not emit a CID. */
export class QueryPublicCatalogStrapiContextStep implements Step<Rows> {
  readonly id = 'query-public-catalog-strapi-context';
  readonly label = 'Contesto completo Strapi del catalogo pubblico';
  readonly kind = 'data' as const;

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return { logGroup: context.vars.get('interopLogGroup'), podApp: context.vars.get('interopPodApp'), levels: 'ALL' };
  }

  async execute(context: RunbookContext): Promise<StepResult<Rows>> {
    return executeStep('Public catalog Strapi context', async () => {
      const logGroup = context.vars.get('interopLogGroup')?.trim();
      const podApp = context.vars.get('interopPodApp')?.trim();
      const environment = context.vars.get('interopEnvironment')?.trim();
      if (!logGroup || !podApp || !environment)
        throw new Error('Missing resolved INTEROP public catalog Strapi context');
      const query = `fields @timestamp, pod_app, pod_namespace, @logStream, stream, log, @message
| filter pod_app = "${escapeLogsInsightsString(podApp)}"
| filter pod_namespace = "${escapeLogsInsightsString(environment)}-public-catalog"
| filter @logStream not like /adot-collector/
| sort @timestamp asc
| limit 1000`;
      const result = await executeCloudWatchLogsQuery(
        context,
        [logGroup],
        query,
        resolveTimeRange(context, { start: 'startTime', end: 'endTime' }),
        {
          ...(context.signal === undefined ? {} : { signal: context.signal }),
          logGroupResolutionMode: 'search-configured-profiles',
          paginateResults: true,
        },
      );
      if (
        result.rows.length >= 1000 ||
        (result.diagnostics?.cloudWatchLogs?.statistics.recordsMatched ?? 0) > result.rows.length
      )
        throw new Error('Strapi context is incomplete; narrow the interval or pod stream');
      return {
        success: true,
        output: result.rows,
        vars: { publicCatalogStrapiContextLogCount: String(result.rows.length) },
        ...(result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics }),
      };
    });
  }
}
