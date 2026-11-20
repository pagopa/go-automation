import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import type { TimeRangeFromParams } from '../../../time/TimeRangeFromParams.js';
import { readStepOutput } from '../../../../../engine/context/readStepOutput.js';
import type { StepCoverage } from '../../../../../engine/types/StepCoverage.js';
import type { StepDiagnostics } from '../../../../../engine/tracing/StepDiagnostics.js';
import { mergeCloudWatchLogsDiagnostics } from '../../../steps/aws/cloudwatch-logs/mergeCloudWatchLogsDiagnostics.js';
import { LAMBDA_REQUEST_ID, lambdaInvocationQuery } from '../helpers/lambdaRequestIdFilter.js';
import { lambdaRowRequestId } from '../helpers/lambdaRowRequestId.js';
import { rowsOfInvocations } from '../helpers/rowsOfInvocations.js';
import { resolveTimeRange } from '../../../time/resolveTimeRange.js';
import { executeStep } from '../../../../../engine/steps/execution/executeStep.js';
import { executeCloudWatchLogsQuery } from '../../../steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
import { LambdaReporter } from '../reporting/LambdaReporter.js';
import { OperationalStep } from '../../../steps/OperationalStep.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;

/** Request ids per invocation query. */
const INVOCATION_BATCH_SIZE = 25;

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
 * entry, the others are kept.
 *
 * @example
 * ```typescript
 * new QueryLambdaInvocationStep({ id: 'query-lambda-invocation', label: '…', lambdaLogGroup, queryTemplate, timeRangeFromParams });
 * ```
 */
export class QueryLambdaInvocationStep extends OperationalStep<Rows> implements Step<Rows> {
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
      query: lambdaInvocationQuery(this.config.queryTemplate, ['00000000-0000-0000-0000-000000000000']),
      logGroups: [this.config.lambdaLogGroup],
      queryKind: 'lambda-invocation-flow',
      batchSize: INVOCATION_BATCH_SIZE,
    };
  }

  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs'];
  }

  override async execute(context: OperationalContext): Promise<StepResult<Rows>> {
    const upstream = readStepOutput<Rows>(context, this.fromStep);
    if (!upstream.ok) return upstream.failure;
    const requestIds = [
      ...new Set(
        upstream.value.flatMap((row) => {
          const requestId = lambdaRowRequestId(row);
          return requestId !== undefined && LAMBDA_REQUEST_ID.test(requestId) ? [requestId] : [];
        }),
      ),
    ];
    if (requestIds.length === 0) {
      return { success: true, output: [], vars: { lambdaInvocationLogCount: '0' } };
    }

    return executeStep('Lambda invocation query', async () => {
      const timeRange = resolveTimeRange(context, this.config.timeRangeFromParams);
      const rows: ReadonlyArray<GOLogsInsightsResultField>[] = [];
      const coverage: StepCoverage[] = [];
      const diagnostics: (StepDiagnostics | undefined)[] = [];
      let failed = 0;
      for (let start = 0; start < requestIds.length; start += INVOCATION_BATCH_SIZE) {
        const batch = requestIds.slice(start, start + INVOCATION_BATCH_SIZE);
        try {
          const result = await executeCloudWatchLogsQuery(
            context,
            [this.config.lambdaLogGroup],
            lambdaInvocationQuery(this.config.queryTemplate, batch),
            timeRange,
            {
              ...(context.signal !== undefined ? { signal: context.signal } : {}),
              logGroupResolutionMode: 'search-configured-profiles',
            },
          );
          rows.push(...rowsOfInvocations(result.rows, batch));
          coverage.push(...result.coverage);
          diagnostics.push(result.diagnostics);
        } catch (error: unknown) {
          if (context.signal?.aborted === true) throw error;
          failed += 1;
          const detail = error instanceof Error ? error.message : String(error);
          coverage.push({ source: this.config.lambdaLogGroup, complete: false, reason: 'unavailable', detail });
        }
      }
      // No batch answered: the reconstruction failed.
      if (failed === Math.ceil(requestIds.length / INVOCATION_BATCH_SIZE)) {
        throw new Error(coverage[0]?.detail ?? 'Lambda invocation query failed');
      }
      new LambdaReporter(context.services.reporter).invocation(requestIds.join(', '), rows.length);
      const merged = mergeCloudWatchLogsDiagnostics(diagnostics);
      return {
        success: true,
        output: rows,
        vars: { lambdaInvocationLogCount: String(rows.length) },
        ...(merged !== undefined ? { diagnostics: merged } : {}),
        ...(coverage.length > 0 ? { coverage } : {}),
      };
    });
  }
}
