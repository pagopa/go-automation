import type { Step, StepKind, StepResult } from '../../../../../engine/index.js';
import { executeStep, readStepOutput } from '../../../../../engine/index.js';
import type { TimeRangeFromParams } from '../../../time/TimeRangeFromParams.js';
import {
  INVOCATION_BATCH_SIZE,
  lambdaInvocationQuery,
  sampleLambdaInvocationQuery,
} from '../helpers/lambdaRequestIdFilter.js';
import { requestIdsOf } from '../helpers/requestIdsOf.js';
import { rowsOfInvocations } from '../helpers/rowsOfInvocations.js';
import { resolveTimeRange } from '../../../time/resolveTimeRange.js';
import { readCloudWatchLogsBatches } from '../../../steps/aws/cloudwatch-logs/readCloudWatchLogsBatches.js';
import { SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS } from '../../../steps/aws/cloudwatch-logs/SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS.js';
import { LambdaReporter } from '../reporting/LambdaReporter.js';
import { OperationalStep } from '../../../steps/OperationalStep.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';
import type { CloudWatchLogsRows } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

/**
 * Configuration of {@link QueryLambdaInvocationStep}.
 */
export interface QueryLambdaInvocationConfig {
  readonly id: string;
  readonly label: string;
  readonly lambdaLogGroup: string;
  /** Query template with the `{{REQUEST_ID_FILTER}}` placeholder. */
  readonly queryTemplate: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
  /** Step of the error scan whose request ids are reconstructed (default `query-lambda-errors`). */
  readonly fromStep?: string;
}

/**
 * Reconstructs the invocation flow of every request id of the error scan, a batch of request ids per query. The
 * rows are divided among the invocations by the engine; a batch that cannot be read is an `unavailable` coverage
 * entry for its request ids, the others are kept. A cancellation or a configuration error of the target ends the step.
 *
 * @example
 * ```typescript
 * new QueryLambdaInvocationStep({ id: 'query-lambda-invocation', label: '…', lambdaLogGroup, queryTemplate, timeRangeFromParams });
 * ```
 */
export class QueryLambdaInvocationStep extends OperationalStep<CloudWatchLogsRows> implements Step<CloudWatchLogsRows> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly fromStep: string;

  /**
   * @param config - Log group, query template and time range
   */
  constructor(private readonly config: QueryLambdaInvocationConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep ?? 'query-lambda-errors';
  }

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      query: sampleLambdaInvocationQuery(this.config.queryTemplate),
      logGroups: [this.config.lambdaLogGroup],
      queryKind: 'lambda-invocation-flow',
      batchSize: INVOCATION_BATCH_SIZE,
    };
  }

  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs'];
  }

  override async execute(context: OperationalContext): Promise<StepResult<CloudWatchLogsRows>> {
    const upstream = readStepOutput<CloudWatchLogsRows>(context, this.fromStep);
    if (!upstream.ok) return upstream.failure;
    const requestIds = requestIdsOf(upstream.value);
    if (requestIds.length === 0) {
      return { success: true, output: [], vars: { lambdaInvocationLogCount: '0' } };
    }

    return executeStep(context, 'Lambda invocation query', async () => {
      // A batch that cannot be read is unavailable for its request ids; no batch answered: the reconstruction failed.
      const read = await readCloudWatchLogsBatches(context, {
        logGroups: [this.config.lambdaLogGroup],
        timeRange: resolveTimeRange(context, this.config.timeRangeFromParams),
        options: SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS,
        items: requestIds,
        batchSize: INVOCATION_BATCH_SIZE,
        query: (batch) => lambdaInvocationQuery(this.config.queryTemplate, batch),
        identifier: (requestId) => ({ kind: 'requestId', value: requestId }),
        rowsOf: (rows, batch) => rowsOfInvocations(rows, batch),
      });
      new LambdaReporter(context.services.reporter).invocation(requestIds.join(', '), read.rows.length);
      return {
        success: true,
        output: read.rows,
        vars: { lambdaInvocationLogCount: String(read.rows.length) },
        ...(read.diagnostics !== undefined ? { diagnostics: read.diagnostics } : {}),
        ...(read.coverage.length > 0 ? { coverage: read.coverage } : {}),
      };
    });
  }
}
