import type { ResultField } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import { readCloudWatchResultRows } from '../../../steps/data/readCloudWatchResultRows.js';

export interface InteropK8sApplicationLogAnalysis {
  readonly logCount: number;
  readonly cidCount: number;
  readonly cids: ReadonlyArray<string>;
  readonly logsWithoutCidCount: number;
  readonly representativeMessages: ReadonlyArray<string>;
}

export interface AnalyzeInteropK8sApplicationLogsStepConfig {
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

export class AnalyzeInteropK8sApplicationLogsStep implements Step<InteropK8sApplicationLogAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly varPrefix: string;
  private readonly countField: string | undefined;

  constructor(config: AnalyzeInteropK8sApplicationLogsStepConfig) {
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

function extractCid(row: ReadonlyArray<ResultField>): string | undefined {
  const explicit = normalize(readField(row, ['cid', 'CID']));
  if (explicit !== undefined) return explicit;

  for (const candidate of readFields(row, ['@message', 'message', 'log'])) {
    const match = CID_PATTERN.exec(candidate);
    const cid = normalize(match?.[1]);
    if (cid !== undefined) return cid;
  }

  return undefined;
}

function extractRepresentativeMessage(row: ReadonlyArray<ResultField>): string | undefined {
  for (const fieldName of REPRESENTATIVE_MESSAGE_FIELDS) {
    const message = normalize(readField(row, [fieldName]));
    if (message !== undefined) return message;
  }
  return undefined;
}

function readRowCount(row: ReadonlyArray<ResultField>, countField: string | undefined): number {
  if (countField === undefined) return 1;
  const parsed = Number(readField(row, [countField]));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

function readField(row: ReadonlyArray<ResultField>, names: ReadonlyArray<string>): string | undefined {
  return readFields(row, names)[0];
}

function readFields(row: ReadonlyArray<ResultField>, names: ReadonlyArray<string>): ReadonlyArray<string> {
  const values: string[] = [];
  for (const field of row) {
    const fieldName = field.field;
    if (fieldName === undefined || !names.includes(fieldName)) continue;
    if (field.value !== undefined) values.push(field.value);
  }
  return values;
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function varName(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`;
}
