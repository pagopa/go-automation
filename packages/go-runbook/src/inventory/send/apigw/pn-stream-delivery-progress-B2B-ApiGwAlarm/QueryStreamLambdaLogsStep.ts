import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { getErrorMessage } from '@pagopa/go-common/errors';

import { executeStep, readStepOutput, type Step, type StepResult } from '../../../../engine/index.js';
import {
  ALARM_TIME_RANGE,
  type CloudWatchLogsBatchedReadResult,
  endsCloudWatchLogsRead,
  logRowIdentity,
  readCloudWatchLogsBatches,
  resolveTimeRange,
  SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS,
  OperationalStep,
  type OperationalContext,
  type OperationalServiceName,
  type CloudWatchLogsRows,
} from '../../../../toolkits/send/index.js';

/** Invocation ids per query: more ids are read with more queries. */
const MAX_REQUEST_IDS_PER_QUERY = 100;

interface Config {
  readonly id: string;
  readonly label: string;
  readonly logGroup: string;
  readonly requestIdField: 'authorizerRequestId' | 'integrationRequestId';
}

/**
 * Reads Lambda evidence only for invocation IDs carried by failed API requests, a query per batch of ids. A batch
 * that cannot be read is unavailable for its ids; when no batch answers the read is `unavailable`.
 */
export class QueryStreamLambdaLogsStep extends OperationalStep<CloudWatchLogsRows> implements Step<CloudWatchLogsRows> {
  readonly id: string;
  readonly label: string;
  readonly kind = 'data' as const;

  constructor(private readonly config: Config) {
    super();
    this.id = config.id;
    this.label = config.label;
  }

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return { logGroups: [this.config.logGroup], identifierMode: 'request-id', queryKind: 'lambda-invocation' };
  }

  /**
   * Operational services this step uses.
   *
   * @returns The required service names
   */
  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs'];
  }

  override async execute(context: OperationalContext): Promise<StepResult<CloudWatchLogsRows>> {
    return executeStep(context, this.label, async () => {
      const upstream = readStepOutput<CloudWatchLogsRows>(context, 'query-api-gw-logs');
      if (!upstream.ok) return upstream.failure;
      const ids = new Set<string>();
      for (const row of upstream.value) {
        if (this.config.requestIdField === 'integrationRequestId') {
          // The v2.9 routes use HTTP integration rather than this Lambda.
          const path = readRowField(row, 'path') ?? '';
          if (!/^\/delivery-progresses\/(?:v2\.[3-8]\/)?streams(?:\/|$)/.test(path)) continue;
        }
        const field = this.config.requestIdField === 'authorizerRequestId' ? 'authorizerStatus' : 'status';
        const status = Number(readRowField(row, field));
        const id = readRowField(row, this.config.requestIdField) ?? '';
        if (status >= 400 && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id)) ids.add(id);
      }
      if (ids.size === 0) return { success: true, output: [], vars: { [this.id]: 'no-request-id' } };
      const timeRange = resolveTimeRange(context, ALARM_TIME_RANGE);
      let read: CloudWatchLogsBatchedReadResult;
      try {
        read = await readCloudWatchLogsBatches(context, {
          logGroups: [this.config.logGroup],
          timeRange,
          options: SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS,
          items: [...ids],
          batchSize: MAX_REQUEST_IDS_PER_QUERY,
          query: (batch) =>
            `fields @timestamp, @requestId, @message\n| filter @requestId in [${batch.map((id) => `'${id}'`).join(', ')}]\n| sort @timestamp asc\n| limit 10000`,
          identifier: (id) => ({ kind: 'requestId', value: id }),
          belongs: (row, id) => readRowField(row, '@requestId') === id,
          rowIdentity: logRowIdentity,
        });
      } catch (error: unknown) {
        if (endsCloudWatchLogsRead(context, error)) throw error;
        const reason = getErrorMessage(error);
        return {
          success: true,
          output: [],
          vars: { [this.id]: 'unavailable', [`${this.id}-reason`]: reason },
          coverage: [{ source: this.config.logGroup, complete: false, reason: 'unavailable', detail: reason }],
        };
      }
      // Recheck returned identifiers so unrelated Lambda errors cannot match a case.
      const rows = read.rows.filter((row) => ids.has(readRowField(row, '@requestId') ?? ''));
      context.services.reporter.add({ label: `${this.label}: ${String(rows.length)} righe correlate` });
      return {
        success: true,
        output: rows,
        vars: { [this.id]: 'queried' },
        ...(read.diagnostics !== undefined ? { diagnostics: read.diagnostics } : {}),
        ...(read.coverage.length > 0 ? { coverage: read.coverage } : {}),
      };
    });
  }
}
