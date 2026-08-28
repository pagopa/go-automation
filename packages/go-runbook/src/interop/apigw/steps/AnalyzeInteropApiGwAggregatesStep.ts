import type { ResultField } from '@go-automation/go-common/aws';
import { extractCwField } from '../../../apigw/helpers/extractCwField.js';
import { readCloudWatchResultRows } from '../../../steps/data/readCloudWatchResultRows.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { InteropApiGwAggregateAnalysis } from '../types/InteropApiGwAggregateAnalysis.js';

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
      errorCount += parseCount(extractCwField(row, 'count'));
      addNormalized(statuses, extractCwField(row, 'status'));
      addNormalized(integrationStatuses, extractCwField(row, 'integrationStatus'));
      addNormalized(integrationErrors, extractCwField(row, 'integrationError'));
      addNormalized(httpMethods, extractCwField(row, 'httpMethod'));
      addNormalized(requestPaths, extractCwField(row, 'requestPath'));
      addNormalized(sourceIps, extractCwField(row, 'sourceIp'));
    }

    const analysis: InteropApiGwAggregateAnalysis = {
      aggregateCount: rows.length,
      errorCount,
      statuses: [...statuses].sort(),
      integrationStatuses: [...integrationStatuses].sort(),
      integrationErrors: [...integrationErrors],
      httpMethods: [...httpMethods].sort(),
      requestPaths: [...requestPaths].sort(),
      sourceIps: [...sourceIps].sort(),
    };

    context.logger?.text(`      ├─ Aggregati API Gateway analizzati: ${analysis.aggregateCount}`);
    context.logger?.text(`      ├─ Errori ${this.errorFamilyLabel} complessivi: ${analysis.errorCount}`);
    context.logger?.text(`      └─ Status: ${analysis.statuses.join(', ') || '-'}`);

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
    const count = parseCount(extractCwField(row, 'count'));
    if (primary === undefined || count > primaryCount) {
      primary = row;
      primaryCount = count;
    }
  }

  return primary;
}

function parseCount(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function addNormalized(target: Set<string>, value: string | undefined): void {
  const normalized = normalize(value);
  if (normalized !== undefined && normalized !== '') target.add(normalized);
}

function readNormalizedField(row: ReadonlyArray<ResultField> | undefined, name: string): string | undefined {
  return row === undefined ? undefined : normalize(extractCwField(row, name));
}

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === '' ? undefined : normalized;
}
