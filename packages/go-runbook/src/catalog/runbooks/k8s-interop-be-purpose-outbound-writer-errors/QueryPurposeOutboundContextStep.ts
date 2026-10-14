import { escapeLogsInsightsString } from '@go-automation/go-common/aws';
import type { ResultField } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepResult } from '../../../types/StepResult.js';
import { executeCloudWatchLogsQuery } from '../../../steps/data/executeCloudWatchLogsQuery.js';
import { executeStep } from '../../../steps/data/executeStep.js';
import { resolveTimeRange } from '../../../steps/data/resolveTimeRange.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;

/** Includes INFO/WARN and works without a request CID, as Kafka errors commonly do. */
export class QueryPurposeOutboundContextStep implements Step<Rows> {
  readonly id = 'query-purpose-outbound-writer-context';
  readonly label = 'Contesto completo del purpose outbound writer';
  readonly kind = 'data' as const;

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return { logGroup: context.vars.get('interopLogGroup'), podApp: context.vars.get('interopPodApp'), levels: 'ALL' };
  }

  async execute(context: RunbookContext): Promise<StepResult<Rows>> {
    return executeStep('Purpose outbound writer context', async () => {
      const logGroup = context.vars.get('interopLogGroup');
      const podApp = context.vars.get('interopPodApp');
      if (logGroup === undefined || podApp === undefined) throw new Error('Missing resolved INTEROP writer context');
      const query = `fields @timestamp, pod_app, @logStream, stream, log, @message
| filter pod_app = "${escapeLogsInsightsString(podApp)}"
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
      if (result.rows.length >= 1000)
        throw new Error('Writer context reached 1000 rows; narrow the interval or pod stream');
      return {
        success: true,
        output: result.rows,
        vars: { purposeOutboundWriterContextLogCount: String(result.rows.length) },
        ...(result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics }),
      };
    });
  }
}
