import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import type { TreeLevelReader } from '../../../../../engine/types/TreeLevelReader.js';
import type { TreeLevelReadResult } from '../../../../../engine/types/TreeLevelReadResult.js';
import type { ReadIdentifier } from '../../../../../engine/types/ReadIdentifier.js';
import { executeCloudWatchLogsQuery } from '../../../steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
import { OperationalStep } from '../../../steps/OperationalStep.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';
import { resolveTimeRange } from '../../../time/resolveTimeRange.js';
import { lambdaInvocationQuery } from '../helpers/lambdaRequestIdFilter.js';
import { LambdaReporter } from '../reporting/LambdaReporter.js';
import type { LambdaDownstreamLevelReaderConfig } from './LambdaDownstreamLevelReaderConfig.js';
import { rowsOfInvocations } from '../helpers/rowsOfInvocations.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;

/**
 * The grouped read of the logs of a Lambda downstream: one query for a batch of request ids, combined in `OR`.
 *
 * @example
 * ```typescript
 * new LambdaDownstreamLevelReader({ id: 'query-pn-delivery', label: '…', downstream, queryTemplate, timeRangeFromParams });
 * ```
 */
export class LambdaDownstreamLevelReader extends OperationalStep<Rows> implements TreeLevelReader {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  /**
   * @param config - Downstream, query template and time range
   */
  constructor(private readonly config: LambdaDownstreamLevelReaderConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
  }

  /**
   * The query of the read for one sample request id, with its log group.
   *
   * @returns Trace metadata of the read
   */
  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      queryKind: 'lambda-downstream',
      logGroups: [this.config.downstream.logGroup],
      query: lambdaInvocationQuery(this.config.queryTemplate, ['00000000-0000-0000-0000-000000000000']),
    };
  }

  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs'];
  }

  /**
   * A grouped read never runs as a step of a pipeline.
   *
   * @returns A failure
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  override async execute(): Promise<StepResult<Rows>> {
    return { success: false, error: `"${this.id}" is the grouped read of a level: the engine calls read().` };
  }

  /**
   * Reads the logs of the downstream for a batch of request ids.
   *
   * @param context - Context of the window
   * @param identifiers - Request ids of the batch
   * @returns The rows, with the coverage of the query
   */
  async read(context: OperationalContext, identifiers: ReadonlyArray<ReadIdentifier>): Promise<TreeLevelReadResult> {
    const { downstream } = this.config;
    const result = await executeCloudWatchLogsQuery(
      context,
      [downstream.logGroup],
      lambdaInvocationQuery(
        this.config.queryTemplate,
        identifiers.map(({ value }) => value),
      ),
      resolveTimeRange(context, this.config.timeRangeFromParams),
      {
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
        logGroupResolutionMode: 'search-configured-profiles',
      },
    );
    new LambdaReporter(context.services.reporter).downstream(downstream.name, downstream.logGroup, result.rows.length);
    return {
      success: true,
      rows: rowsOfInvocations(
        result.rows,
        identifiers.map(({ value }) => value),
      ),
      ...(result.coverage.length > 0 ? { coverage: result.coverage } : {}),
      ...(result.diagnostics !== undefined ? { diagnostics: result.diagnostics } : {}),
    };
  }
}
