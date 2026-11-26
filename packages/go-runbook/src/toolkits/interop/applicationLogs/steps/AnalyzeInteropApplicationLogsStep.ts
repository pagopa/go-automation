import { trimToUndefined } from '@pagopa/go-common/utils';
import { readRowFields } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { RunbookContext, Step, StepKind, StepResult } from '../../../../engine/index.js';
import { readCloudWatchResultRows } from '../../../common/parsing/aws/cloudwatch-logs/readCloudWatchResultRows.js';
import { INTEROP_CID_PATTERN } from '../helpers/INTEROP_CID_PATTERN.js';
import type { CloudWatchLogsRow } from '../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';
import type { AnalyzeInteropApplicationLogsStepConfig } from './AnalyzeInteropApplicationLogsStepConfig.js';
import type { InteropK8sApplicationLogAnalysis } from './InteropK8sApplicationLogAnalysis.js';

const MAX_REPRESENTATIVE_MESSAGES = 5;
const REPRESENTATIVE_MESSAGE_FIELDS = ['@message', 'message', 'log', 'errorMessage'] as const;

/**
 * Counts the INTEROP application-log rows of a query, collects their distinct CIDs and some representative messages,
 * and publishes them as variables with a prefix.
 */
export class AnalyzeInteropApplicationLogsStep implements Step<InteropK8sApplicationLogAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly varPrefix: string;
  private readonly countField: string | undefined;

  constructor(config: AnalyzeInteropApplicationLogsStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.varPrefix = config.varPrefix;
    this.countField = config.countField;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<InteropK8sApplicationLogAnalysis>> {
    const rows = readCloudWatchResultRows(context.stepResults.get(this.fromStep));
    if (rows === undefined) return { success: false, error: `Step output not found: "${this.fromStep}"` };

    const cids: string[] = [];
    const seenCids = new Set<string>();
    let logsWithoutCidCount = 0;
    let logCount = 0;
    const representativeMessages: string[] = [];

    for (const row of rows) {
      const rowCount = readRowCount(row, this.countField);
      logCount += rowCount;
      const cid = extractCid(row);
      if (cid === undefined) {
        logsWithoutCidCount += rowCount;
      } else if (!seenCids.has(cid)) {
        seenCids.add(cid);
        cids.push(cid);
      }

      const message = extractRepresentativeMessage(row);
      if (message !== undefined && representativeMessages.length < MAX_REPRESENTATIVE_MESSAGES) {
        representativeMessages.push(message);
      }
    }

    const analysis: InteropK8sApplicationLogAnalysis = {
      logCount,
      cidCount: cids.length,
      cids,
      logsWithoutCidCount,
      representativeMessages,
    };

    context.services.reporter.add(
      { label: `Log applicativi analizzati: ${analysis.logCount}` },
      { label: `CID distinti: ${cids.length}` },
      { label: `Log senza CID: ${logsWithoutCidCount}` },
    );

    return {
      success: true,
      output: analysis,
      vars: {
        [varName(this.varPrefix, 'LogCount')]: String(analysis.logCount),
        [varName(this.varPrefix, 'CidCount')]: String(analysis.cidCount),
        [varName(this.varPrefix, 'Cids')]: JSON.stringify(analysis.cids),
        [varName(this.varPrefix, 'LogsWithoutCidCount')]: String(analysis.logsWithoutCidCount),
        [varName(this.varPrefix, 'ErrorMsg')]: analysis.representativeMessages[0] ?? '',
        [varName(this.varPrefix, 'AnalysisCompleted')]: 'true',
      },
    };
  }
}

function extractCid(row: CloudWatchLogsRow): string | undefined {
  const explicit = trimToUndefined(readRowFields(row, ['cid', 'CID'])[0]);
  if (explicit !== undefined) return explicit;

  for (const candidate of readRowFields(row, ['@message', 'message', 'log'])) {
    const match = INTEROP_CID_PATTERN.exec(candidate);
    const cid = trimToUndefined(match?.[1]);
    if (cid !== undefined) return cid;
  }

  return undefined;
}

function extractRepresentativeMessage(row: CloudWatchLogsRow): string | undefined {
  for (const fieldName of REPRESENTATIVE_MESSAGE_FIELDS) {
    const message = trimToUndefined(readRowFields(row, [fieldName])[0]);
    if (message !== undefined) return message;
  }
  return undefined;
}

function readRowCount(row: CloudWatchLogsRow, countField: string | undefined): number {
  if (countField === undefined) return 1;
  const parsed = Number(readRowFields(row, [countField])[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

function varName(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`;
}
