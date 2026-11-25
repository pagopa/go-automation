import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { getErrorMessage } from '@pagopa/go-common/errors';
import type { RunbookContext, Step, StepKind, StepResult } from '../../../../engine/index.js';
import type { TimeRangeFromParams } from '../../../common/time/TimeRangeFromParams.js';
import { resolveTimeRange } from '../../../common/time/resolveTimeRange.js';
import type { BuildInteropK8sCidTrackerQueryFn } from '../types/BuildInteropK8sCidTrackerQueryFn.js';
import type { InteropK8sApplicationLogAnalysis } from './InteropK8sApplicationLogAnalysis.js';
import { OperationalStep } from '../../../common/steps/OperationalStep.js';
import type { CloudWatchLogsBatchedReadResult } from '../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsBatchedReadResult.js';
import { endsCloudWatchLogsRead } from '../../../common/steps/aws/cloudwatch-logs/endsCloudWatchLogsRead.js';
import { readCloudWatchLogsBatches } from '../../../common/steps/aws/cloudwatch-logs/readCloudWatchLogsBatches.js';
import { logRowIdentity } from '../../../common/steps/aws/cloudwatch-logs/logRowIdentity.js';
import { SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS } from '../../../common/steps/aws/cloudwatch-logs/SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS.js';
import { readNonBlankVar } from '../../helpers/readNonBlankVar.js';
import type { OperationalContext } from '../../../common/services/OperationalContext.js';
import type { OperationalServiceName } from '../../../common/services/OperationalServiceName.js';
import type { CloudWatchLogsRow } from '../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';
import type { CloudWatchLogsRows } from '../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';
import type { InteropK8sCidTrackerResult } from './InteropK8sCidTrackerResult.js';
import type { QueryInteropCidTrackerStepConfig } from './QueryInteropCidTrackerStepConfig.js';

const DEFAULT_LOG_GROUP_VAR = 'interopLogGroup';
const DEFAULT_VAR_PREFIX = 'interopCidTracker';
/** CIDs read by one query: the query stays far below the length limit of Logs Insights. */
const CID_BATCH_SIZE = 50;
const CID_TRACKER_SOURCE = 'CID tracker';

/**
 * Reads the CID tracker of the CIDs found by the application analysis, a Logs Insights query per batch of CIDs.
 *
 * - Each row goes to the CID of its `cid` field, the one the query extracts and filters on.
 * - A failed batch is `unavailable` for its CIDs, which have no result; a batch at the row limit is `saturated` for
 *   its CIDs.
 * - A cancellation and a configuration error of the target stop the step.
 */
export class QueryInteropCidTrackerStep
  extends OperationalStep<ReadonlyArray<InteropK8sCidTrackerResult>>
  implements Step<ReadonlyArray<InteropK8sCidTrackerResult>>
{
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly fromStep: string;
  private readonly timeRangeFromParams: TimeRangeFromParams;
  private readonly logGroupVar: string;
  private readonly varPrefix: string;
  private readonly queryProfileId: string;
  private readonly buildQuery: BuildInteropK8sCidTrackerQueryFn;

  constructor(config: QueryInteropCidTrackerStepConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.timeRangeFromParams = config.timeRangeFromParams;
    this.logGroupVar = config.logGroupVar ?? DEFAULT_LOG_GROUP_VAR;
    this.varPrefix = config.varPrefix ?? DEFAULT_VAR_PREFIX;
    this.queryProfileId = config.queryProfileId;
    this.buildQuery = config.buildQuery;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const logGroup = context.vars.get(this.logGroupVar);
    const cids = readApplicationAnalysis(context, this.fromStep)?.cids ?? [];
    return {
      queryProfileId: this.queryProfileId,
      queryKind: 'interop-cid-tracker',
      logGroups: logGroup === undefined ? [] : [logGroup],
      identifiers: { cids },
      queries: cidBatches(cids).map((batch) => ({ cids: batch, query: this.buildQuery(batch) })),
      timeRange: {
        start: context.params.get(this.timeRangeFromParams.start) ?? null,
        end: context.params.get(this.timeRangeFromParams.end) ?? null,
      },
    };
  }

  /**
   * Operational services this step uses.
   *
   * @returns The required service names
   */
  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs'];
  }

  override async execute(context: OperationalContext): Promise<StepResult<ReadonlyArray<InteropK8sCidTrackerResult>>> {
    const analysis = readApplicationAnalysis(context, this.fromStep);
    if (analysis === undefined) return { success: false, error: `Step output not found: "${this.fromStep}"` };

    const logGroup = readNonBlankVar(context, this.logGroupVar);
    if (logGroup === undefined) {
      return { success: false, error: `Missing required runbook variable: ${this.logGroupVar}` };
    }

    if (analysis.cids.length === 0) {
      context.services.reporter.add({ label: 'Query CID tracker: skip, nessun CID disponibile' });
      return {
        success: true,
        output: [],
        vars: {
          [varName(this.varPrefix, 'Executed')]: 'false',
          [varName(this.varPrefix, 'CidCount')]: '0',
          [varName(this.varPrefix, 'LogCount')]: '0',
        },
      };
    }

    context.services.reporter.add({ label: `Query CID tracker [${String(analysis.cids.length)} CID]` });
    const cidResults: InteropK8sCidTrackerResult[] = [];
    let read: CloudWatchLogsBatchedReadResult;
    try {
      read = await readCloudWatchLogsBatches(context, {
        logGroups: [logGroup],
        timeRange: resolveTimeRange(context, this.timeRangeFromParams),
        options: SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS,
        source: CID_TRACKER_SOURCE,
        items: analysis.cids,
        batchSize: CID_BATCH_SIZE,
        query: (batch) => this.buildQuery(batch),
        identifier: (cid) => ({ kind: 'cid', value: cid }),
        rowsOf: (rows, batch) => {
          cidResults.push(...attributeToCids(rows, batch));
          return rows;
        },
        belongs: (row, cid) => readRowField(row, 'cid') === cid,
        rowIdentity: logRowIdentity,
      });
    } catch (error: unknown) {
      // No batch answered: every CID is unread.
      if (endsCloudWatchLogsRead(context, error)) throw error;
      const detail = getErrorMessage(error);
      context.services.reporter.add({ label: `Query CID tracker non riuscita: ${detail}` });
      return {
        success: true,
        output: [],
        coverage: [
          {
            source: CID_TRACKER_SOURCE,
            complete: false,
            reason: 'unavailable',
            detail,
            identifiers: analysis.cids.map((cid) => ({ kind: 'cid', value: cid })),
          },
        ],
        vars: this.vars(analysis.cids.length, 0),
      };
    }
    for (const failure of read.failures) {
      context.services.reporter.add({ label: `Query CID tracker non riuscita: ${failure.message}` });
    }

    context.services.reporter.add({ label: `Log CID tracker trovati: ${read.rows.length}` });
    return {
      success: true,
      output: cidResults,
      ...(read.diagnostics === undefined ? {} : { diagnostics: read.diagnostics }),
      ...(read.coverage.length > 0 ? { coverage: read.coverage } : {}),
      vars: this.vars(analysis.cids.length, read.rows.length),
    };
  }

  private vars(cidCount: number, logCount: number): Readonly<Record<string, string>> {
    return {
      [varName(this.varPrefix, 'Executed')]: 'true',
      [varName(this.varPrefix, 'CidCount')]: String(cidCount),
      [varName(this.varPrefix, 'LogCount')]: String(logCount),
    };
  }
}

function cidBatches(cids: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<string>> {
  const batches: ReadonlyArray<string>[] = [];
  for (let start = 0; start < cids.length; start += CID_BATCH_SIZE)
    batches.push(cids.slice(start, start + CID_BATCH_SIZE));
  return batches;
}

/** The rows of a batch by CID, in the order of the batch; a CID without rows has an empty result. */
function attributeToCids(
  rows: CloudWatchLogsRows,
  batch: ReadonlyArray<string>,
): ReadonlyArray<InteropK8sCidTrackerResult> {
  const byCid = new Map<string, CloudWatchLogsRow[]>(batch.map((cid) => [cid, []]));
  for (const row of rows) {
    const cid = readRowField(row, 'cid');
    if (cid !== undefined) byCid.get(cid)?.push(row);
  }
  return [...byCid].map(([cid, cidRows]) => ({ cid, rows: cidRows }));
}

function readApplicationAnalysis(
  context: RunbookContext,
  stepId: string,
): InteropK8sApplicationLogAnalysis | undefined {
  const value = context.stepResults.get(stepId);
  if (!isApplicationAnalysis(value)) return undefined;
  return value;
}

function isApplicationAnalysis(value: unknown): value is InteropK8sApplicationLogAnalysis {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Readonly<Record<string, unknown>>;
  return Array.isArray(record['cids']) && typeof record['logCount'] === 'number';
}

function varName(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`;
}
