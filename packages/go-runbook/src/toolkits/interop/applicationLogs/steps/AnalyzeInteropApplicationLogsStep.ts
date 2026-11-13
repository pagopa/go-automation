import { type GOLogsInsightsResultField, readRowFields } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { RunbookContext } from '../../../../engine/types/RunbookContext.js';
import type { Step } from '../../../../engine/types/Step.js';
import type { StepKind } from '../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../engine/types/StepResult.js';
import { readCloudWatchResultRows } from '../../../common/parsing/aws/cloudwatch-logs/readCloudWatchResultRows.js';

export interface InteropK8sApplicationLogAnalysis {
  readonly logCount: number;
  readonly cidCount: number;
  readonly cids: ReadonlyArray<string>;
  readonly logsWithoutCidCount: number;
  readonly representativeMessages: ReadonlyArray<string>;
}

export interface AnalyzeInteropApplicationLogsStepConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly varPrefix: string;
  /** Optional aggregate field whose numeric values represent the original log count. */
  readonly countField?: string;
}

const CID_PATTERN = /\bCID=([^\]\s,"']+)/u;
const MAX_REPRESENTATIVE_MESSAGES = 5;
const REPRESENTATIVE_MESSAGE_FIELDS = ['@message', 'message', 'log', 'errorMessage'] as const;

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

function extractCid(row: ReadonlyArray<GOLogsInsightsResultField>): string | undefined {
  const explicit = normalize(readRowFields(row, ['cid', 'CID'])[0]);
  if (explicit !== undefined) return explicit;

  for (const candidate of readRowFields(row, ['@message', 'message', 'log'])) {
    const match = CID_PATTERN.exec(candidate);
    const cid = normalize(match?.[1]);
    if (cid !== undefined) return cid;
  }

  return undefined;
}

function extractRepresentativeMessage(row: ReadonlyArray<GOLogsInsightsResultField>): string | undefined {
  for (const fieldName of REPRESENTATIVE_MESSAGE_FIELDS) {
    const message = normalize(readRowFields(row, [fieldName])[0]);
    if (message !== undefined) return message;
  }
  return undefined;
}

function readRowCount(row: ReadonlyArray<GOLogsInsightsResultField>, countField: string | undefined): number {
  if (countField === undefined) return 1;
  const parsed = Number(readRowFields(row, [countField])[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function varName(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`;
}
