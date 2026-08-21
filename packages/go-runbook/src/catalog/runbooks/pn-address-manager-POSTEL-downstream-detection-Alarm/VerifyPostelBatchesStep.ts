import type { ResultField } from '@go-automation/go-common/aws';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { TimeRange } from '../../../types/TimeRange.js';
import { SEND_SERVICE_PROFILE } from '../../../service/profiles/SEND_SERVICE_PROFILE.js';
import { executeCloudWatchLogsQuery } from '../../../steps/data/executeCloudWatchLogsQuery.js';
import { executeStep } from '../../../steps/data/executeStep.js';
import { readStepOutput } from '../../../steps/data/readStepOutput.js';

type CloudWatchRows = ReadonlyArray<ReadonlyArray<ResultField>>;

const BATCH_TRACE_ID_PATTERN = /^batch_id:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MAX_BATCH_ID_SAMPLES = 10;

const POSTEL_RECOVERY_AFTER_MINUTES = 120;

export const POSTEL_WORKED_BATCH_QUERY: string = [
  'fields @timestamp, @message',
  "| filter @message like 'pn-addressManager-NormalizzatoreBatch'",
  "  and @message like 'status=WORKED'",
  '| parse @message /batchId=(?<batchId>[0-9a-fA-F-]{36})/',
  '| stats min(@timestamp) as workedAt by batchId',
  '| sort workedAt asc',
  '| limit 10000',
].join('\n');

export interface PostelBatchRecovery {
  readonly impactedBatchIds: ReadonlyArray<string>;
  readonly workedBatchIds: ReadonlyArray<string>;
  readonly pendingBatchIds: ReadonlyArray<string>;
  readonly allWorked: boolean;
  readonly statusRowsFound: number;
  readonly lookupTimeRange: {
    readonly start: string;
    readonly end: string;
  };
}

export interface VerifyPostelBatchesConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly logGroup: string;
  readonly recoveryAfterMinutes?: number;
}

/**
 * Verifies the eventual outcome of every POSTEL batch found in the alarm
 * error rows. The PDF allows either DynamoDB or application logs; logs are
 * used here because they work for historical occurrences and through the
 * existing multi-profile CloudWatch resolution path.
 */
export class VerifyPostelBatchesStep implements Step<PostelBatchRecovery> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly fromStep: string;
  private readonly logGroup: string;
  private readonly recoveryAfterMinutes: number;
  private readonly query: string = POSTEL_WORKED_BATCH_QUERY;

  constructor(config: VerifyPostelBatchesConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.logGroup = config.logGroup;
    this.recoveryAfterMinutes = config.recoveryAfterMinutes ?? POSTEL_RECOVERY_AFTER_MINUTES;

    if (!Number.isInteger(this.recoveryAfterMinutes) || this.recoveryAfterMinutes <= 0) {
      throw new Error('VerifyPostelBatchesStep: recoveryAfterMinutes must be a positive integer.');
    }
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const timeRange = this.resolveLookupTimeRange(context);
    return {
      queryProfileId: SEND_SERVICE_PROFILE.id,
      queryKind: 'postel-batch-recovery',
      identifierMode: 'batch-id',
      sourceStep: this.fromStep,
      recoveryAfterMinutes: this.recoveryAfterMinutes,
      query: this.query,
      logGroups: [this.logGroup],
      timeRange: {
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
      },
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<PostelBatchRecovery>> {
    return executeStep('POSTEL batch recovery check', async () => {
      const upstream = readStepOutput<CloudWatchRows>(context, this.fromStep);
      if (!upstream.ok) return upstream.failure;

      const impactedBatchIds = extractImpactedBatchIds(upstream.value);
      const timeRange = this.resolveLookupTimeRange(context);

      if (impactedBatchIds.length === 0) {
        const output = buildRecovery([], new Set<string>(), 0, timeRange);
        context.logger?.text('      └─ Verifica batch POSTEL: nessun batch_id individuato nei log di errore');
        return {
          success: true,
          output,
          vars: recoveryVars(output, this.recoveryAfterMinutes),
          next: 'resolve' as const,
        };
      }

      context.logger?.text(`      ├─ Verifica batch POSTEL: ${String(impactedBatchIds.length)} batch impattati`);
      const queryResult = await executeCloudWatchLogsQuery(context, [this.logGroup], this.query, timeRange, {
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
        logGroupResolutionMode: 'search-configured-profiles',
        paginateResults: true,
      });

      const output = buildRecovery(
        impactedBatchIds,
        extractWorkedBatchIds(queryResult.rows),
        queryResult.rows.length,
        timeRange,
      );
      context.logger?.text(
        `      └─ Batch POSTEL WORKED: ${String(output.workedBatchIds.length)}/${String(output.impactedBatchIds.length)}`,
      );

      return {
        success: true,
        output,
        vars: recoveryVars(output, this.recoveryAfterMinutes),
        ...(queryResult.diagnostics !== undefined ? { diagnostics: queryResult.diagnostics } : {}),
        next: 'resolve' as const,
      };
    });
  }

  private resolveLookupTimeRange(context: RunbookContext): TimeRange {
    const start = parseDateParam(context, 'startTime');
    const referenceParam =
      present(context.params.get('alarmDatetimeEnd')) !== undefined
        ? 'alarmDatetimeEnd'
        : present(context.params.get('alarmDatetime')) !== undefined
          ? 'alarmDatetime'
          : 'endTime';
    const reference = parseDateParam(context, referenceParam);
    const end = new Date(reference.getTime() + this.recoveryAfterMinutes * 60_000);
    if (end.getTime() < start.getTime()) {
      throw new Error('VerifyPostelBatchesStep: resolved recovery window ends before it starts.');
    }
    return { start, end };
  }
}

function extractImpactedBatchIds(rows: CloudWatchRows): ReadonlyArray<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const traceId = fieldValue(row, ['trace_id', '@trace_id']);
    const id = traceId === undefined ? undefined : BATCH_TRACE_ID_PATTERN.exec(traceId.trim())?.[1];
    if (id !== undefined) ids.add(id.toLowerCase());
  }
  return [...ids];
}

function extractWorkedBatchIds(rows: CloudWatchRows): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = fieldValue(row, ['batchId']);
    if (id !== undefined) ids.add(id.toLowerCase());
  }
  return ids;
}

function buildRecovery(
  impactedBatchIds: ReadonlyArray<string>,
  workedIds: ReadonlySet<string>,
  statusRowsFound: number,
  timeRange: TimeRange,
): PostelBatchRecovery {
  const workedBatchIds = impactedBatchIds.filter((id) => workedIds.has(id));
  const pendingBatchIds = impactedBatchIds.filter((id) => !workedIds.has(id));
  return {
    impactedBatchIds: [...impactedBatchIds],
    workedBatchIds,
    pendingBatchIds,
    allWorked: impactedBatchIds.length > 0 && pendingBatchIds.length === 0,
    statusRowsFound,
    lookupTimeRange: {
      start: timeRange.start.toISOString(),
      end: timeRange.end.toISOString(),
    },
  };
}

function recoveryVars(output: PostelBatchRecovery, recoveryAfterMinutes: number): Readonly<Record<string, string>> {
  return {
    postelImpactedBatchCount: String(output.impactedBatchIds.length),
    postelWorkedBatchCount: String(output.workedBatchIds.length),
    postelPendingBatchCount: String(output.pendingBatchIds.length),
    postelAllBatchesWorked: String(output.allWorked),
    postelImpactedBatchIds: formatBatchIdSamples(output.impactedBatchIds),
    postelPendingBatchIds: formatBatchIdSamples(output.pendingBatchIds),
    postelRecoveryAfterMinutes: String(recoveryAfterMinutes),
    postelRecoveryWindowEnd: output.lookupTimeRange.end,
  };
}

function formatBatchIdSamples(ids: ReadonlyArray<string>): string {
  if (ids.length === 0) return 'nessuno';
  const samples = ids.slice(0, MAX_BATCH_ID_SAMPLES).join(', ');
  const omitted = ids.length - MAX_BATCH_ID_SAMPLES;
  return omitted > 0 ? `${samples} (+${String(omitted)} ulteriori)` : samples;
}

function fieldValue(row: ReadonlyArray<ResultField>, candidates: ReadonlyArray<string>): string | undefined {
  for (const candidate of candidates) {
    const value = row.find((field) => field.field === candidate)?.value;
    if (value !== undefined) return value;
  }
  return undefined;
}

function parseDateParam(context: RunbookContext, name: string): Date {
  const raw = present(context.params.get(name));
  if (raw === undefined) throw new Error(`VerifyPostelBatchesStep: missing parameter ${name}.`);
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new Error(`VerifyPostelBatchesStep: parameter ${name} is not a valid date.`);
  }
  return value;
}

function present(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized === '' ? undefined : normalized;
}
