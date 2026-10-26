import { readRowField } from '@go-automation/go-common/aws';
import type { ResultField } from '@go-automation/go-common/aws';
import type { Step } from '../../../types/Step.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { StepResult } from '../../../types/StepResult.js';
import { readStepOutput } from '../../../steps/data/readStepOutput.js';
import { executeStep } from '../../../steps/data/executeStep.js';
import { executeCloudWatchLogsQuery } from '../../../steps/data/executeCloudWatchLogsQuery.js';
import { resolveTimeRange } from '../../../steps/data/resolveTimeRange.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;

interface Config {
  readonly id: string;
  readonly label: string;
  readonly logGroup: string;
  readonly requestIdField: 'authorizerRequestId' | 'integrationRequestId';
}

/** Reads Lambda evidence only for invocation IDs carried by failed API requests. */
export class QueryStreamLambdaLogsStep implements Step<Rows> {
  readonly id: string;
  readonly label: string;
  readonly kind = 'data' as const;
  private readonly config: Config;

  constructor(config: Config) {
    this.id = config.id;
    this.label = config.label;
    this.config = config;
  }

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return { logGroups: [this.config.logGroup], identifierMode: 'request-id', queryKind: 'lambda-invocation' };
  }

  async execute(context: RunbookContext): Promise<StepResult<Rows>> {
    return executeStep(this.label, async () => {
      const upstream = readStepOutput<Rows>(context, 'query-api-gw-logs');
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
      if (ids.size === 0 || ids.size > 100) {
        return {
          success: true,
          output: [],
          vars: { [this.id]: ids.size === 0 ? 'no-request-id' : 'too-many-request-ids' },
        };
      }
      const query = `fields @timestamp, @requestId, @message\n| filter @requestId in [${[...ids].map((id) => `'${id}'`).join(', ')}]\n| sort @timestamp asc\n| limit 10000`;
      const timeRange = resolveTimeRange(context, { start: 'startTime', end: 'endTime' });
      try {
        const result = await executeCloudWatchLogsQuery(context, [this.config.logGroup], query, timeRange, {
          logGroupResolutionMode: 'search-configured-profiles',
          ...(context.signal !== undefined ? { signal: context.signal } : {}),
        });
        // Recheck returned identifiers so unrelated Lambda errors cannot match a case.
        const rows = result.rows.filter((row) => ids.has(readRowField(row, '@requestId') ?? ''));
        context.services.reporter.add({ label: `${this.label}: ${String(rows.length)} righe correlate` });
        return {
          success: true,
          output: rows,
          vars: { [this.id]: 'queried' },
          ...(result.diagnostics !== undefined ? { diagnostics: result.diagnostics } : {}),
          next: 'resolve' as const,
        };
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        return { success: true, output: [], vars: { [this.id]: 'unavailable', [`${this.id}-reason`]: reason } };
      }
    });
  }
}
