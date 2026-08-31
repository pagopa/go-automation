import { readRowField } from '@go-automation/go-common/aws';
import type { ResultField } from '@go-automation/go-common/aws';
import { readCloudWatchResultRows } from '../../../steps/data/readCloudWatchResultRows.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import { normalizeInteropApiGwAggregateValue } from '../helpers/normalizeInteropApiGwAggregateValue.js';
import type { InteropApiGwAggregateAnalysis } from '../types/InteropApiGwAggregateAnalysis.js';
import { logStepTree } from '../../../core/logStepTree.js';

export interface AnalyzeInteropApiGwAggregatesStepConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly errorFamilyLabel: string;
}

export class AnalyzeInteropApiGwAggregatesStep implements Step<InteropApiGwAggregateAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly errorFamilyLabel: string;

  constructor(config: AnalyzeInteropApiGwAggregatesStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.errorFamilyLabel = config.errorFamilyLabel;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<InteropApiGwAggregateAnalysis>> {
    const rows = readCloudWatchResultRows(context.stepResults.get(this.fromStep));
    if (rows === undefined) return { success: false, error: `Step output not found: "${this.fromStep}"` };

    const statuses = new Set<string>();
    const integrationStatuses = new Set<string>();
    const integrationErrors = new Set<string>();
    const httpMethods = new Set<string>();
    const requestPaths = new Set<string>();
    const sourceIps = new Set<string>();
    const primaryRow = selectPrimaryAggregateRow(rows);
    let errorCount = 0;

    for (const row of rows) {
      errorCount += parseCount(readRowField(row, 'count'));
      addNormalized(statuses, readRowField(row, 'status'));
      addNormalized(integrationStatuses, readRowField(row, 'integrationStatus'));
      addNormalized(integrationErrors, readRowField(row, 'integrationError'));
      addNormalized(httpMethods, readRowField(row, 'httpMethod'));
      addNormalized(requestPaths, readRowField(row, 'requestPath'));
      addNormalized(sourceIps, readRowField(row, 'sourceIp'));
    }

    const analysis: InteropApiGwAggregateAnalysis = {
      aggregateCount: rows.length,
      errorCount,
      statuses: [...statuses].sort(),
      integrationStatuses: [...integrationStatuses].sort(),
      integrationErrors: [...integrationErrors].sort(),
      httpMethods: [...httpMethods].sort(),
      requestPaths: [...requestPaths].sort(),
      sourceIps: [...sourceIps].sort(),
    };

    logStepTree(context.logger, [
      { label: `Aggregati API Gateway analizzati: ${analysis.aggregateCount}` },
      { label: `Errori ${this.errorFamilyLabel} complessivi: ${analysis.errorCount}` },
      { label: `Status: ${analysis.statuses.join(', ') || '-'}` },
    ]);

    return {
      success: true,
      output: analysis,
      vars: {
        apiGwErrorCount: String(analysis.errorCount),
        apiGwStatusCode: readNormalizedField(primaryRow, 'status') ?? '',
        apiGwIntegrationStatus: readNormalizedField(primaryRow, 'integrationStatus') ?? '',
        apiGwErrorMessage: readNormalizedField(primaryRow, 'integrationError') ?? '',
        apiGwHttpMethod: readNormalizedField(primaryRow, 'httpMethod') ?? '',
        apiGwPath: readNormalizedField(primaryRow, 'requestPath') ?? '',
        apiGwSourceIp: readNormalizedField(primaryRow, 'sourceIp') ?? '',
      },
    };
  }
}

function selectPrimaryAggregateRow(
  rows: ReadonlyArray<ReadonlyArray<ResultField>>,
): ReadonlyArray<ResultField> | undefined {
  let primary: ReadonlyArray<ResultField> | undefined;
  let primaryCount = -1;

  for (const row of rows) {
    const count = parseCount(readRowField(row, 'count'));
    if (
      primary === undefined ||
      count > primaryCount ||
      (count === primaryCount && compareRepresentativeFields(row, primary) < 0)
    ) {
      primary = row;
      primaryCount = count;
    }
  }

  return primary;
}

const REPRESENTATIVE_FIELDS = [
  'status',
  'integrationStatus',
  'integrationError',
  'httpMethod',
  'requestPath',
  'sourceIp',
] as const;

function compareRepresentativeFields(left: ReadonlyArray<ResultField>, right: ReadonlyArray<ResultField>): number {
  for (const field of REPRESENTATIVE_FIELDS) {
    const leftValue = readNormalizedField(left, field);
    const rightValue = readNormalizedField(right, field);
    if (leftValue === rightValue) continue;
    if (leftValue === undefined) return 1;
    if (rightValue === undefined) return -1;
    return leftValue < rightValue ? -1 : 1;
  }
  return 0;
}

function parseCount(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function addNormalized(target: Set<string>, value: string | undefined): void {
  const normalized = normalizeInteropApiGwAggregateValue(value);
  if (normalized !== undefined) target.add(normalized);
}

function readNormalizedField(row: ReadonlyArray<ResultField> | undefined, name: string): string | undefined {
  return row === undefined ? undefined : normalizeInteropApiGwAggregateValue(readRowField(row, name));
}
