import type { EvidenceIdentifier } from '../../../../../engine/index.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import { CloudWatchLogsLevelReader } from '../../../tree/CloudWatchLogsLevelReader.js';
import { lambdaInvocationQuery, sampleLambdaInvocationQuery } from '../helpers/lambdaRequestIdFilter.js';
import { LambdaReporter } from '../reporting/LambdaReporter.js';
import type { LambdaDownstreamLevelReaderConfig } from './LambdaDownstreamLevelReaderConfig.js';
import { rowsOfInvocations } from '../helpers/rowsOfInvocations.js';
import type { CloudWatchLogsRows } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

/**
 * The grouped read of the logs of a Lambda downstream: one query for a batch of request ids, combined in `OR`.
 *
 * @example
 * ```typescript
 * new LambdaDownstreamLevelReader({ id: 'query-pn-delivery', label: '…', downstream, queryTemplate, timeRangeFromParams });
 * ```
 */
export class LambdaDownstreamLevelReader extends CloudWatchLogsLevelReader<LambdaDownstreamLevelReaderConfig> {
  /**
   * The query of the read for one sample request id, with its log group.
   *
   * @returns Trace metadata of the read
   */
  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      queryKind: 'lambda-downstream',
      logGroups: [this.config.downstream.logGroup],
      query: sampleLambdaInvocationQuery(this.config.queryTemplate),
    };
  }

  protected override logGroups(): ReadonlyArray<string> {
    return [this.config.downstream.logGroup];
  }

  protected override query(identifiers: ReadonlyArray<EvidenceIdentifier>): string {
    return lambdaInvocationQuery(
      this.config.queryTemplate,
      identifiers.map(({ value }) => value),
    );
  }

  protected override rowsOf(
    rows: CloudWatchLogsRows,
    identifiers: ReadonlyArray<EvidenceIdentifier>,
  ): CloudWatchLogsRows {
    return rowsOfInvocations(
      rows,
      identifiers.map(({ value }) => value),
    );
  }

  protected override report(context: OperationalContext, rowCount: number): void {
    const { downstream } = this.config;
    new LambdaReporter(context.services.reporter).downstream(downstream.name, downstream.logGroup, rowCount);
  }
}
