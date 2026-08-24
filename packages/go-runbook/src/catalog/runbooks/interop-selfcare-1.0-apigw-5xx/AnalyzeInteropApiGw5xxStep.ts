import type { ResultField } from '@go-automation/go-common/aws';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import { readCloudWatchResultRows } from '../../../steps/data/readCloudWatchResultRows.js';

import { apigw } from '../framework.js';

export interface InteropApiGw5xxAnalysis {
  readonly aggregateCount: number;
  readonly errorCount: number;
  readonly statuses: ReadonlyArray<string>;
  readonly integrationStatuses: ReadonlyArray<string>;
  readonly integrationErrors: ReadonlyArray<string>;
  readonly httpMethods: ReadonlyArray<string>;
  readonly requestPaths: ReadonlyArray<string>;
  readonly sourceIps: ReadonlyArray<string>;
}

export class AnalyzeInteropApiGw5xxStep implements Step<InteropApiGw5xxAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;

  constructor(config: { readonly id: string; readonly label: string; readonly fromStep: string }) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<InteropApiGw5xxAnalysis>> {
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
      errorCount += parseCount(apigw.extractCwField(row, 'count'));
      addNormalized(statuses, apigw.extractCwField(row, 'status'));
      addNormalized(integrationStatuses, apigw.extractCwField(row, 'integrationStatus'));
      addNormalized(integrationErrors, apigw.extractCwField(row, 'integrationError'));
      addNormalized(httpMethods, apigw.extractCwField(row, 'httpMethod'));
      addNormalized(requestPaths, apigw.extractCwField(row, 'requestPath'));
      addNormalized(sourceIps, apigw.extractCwField(row, 'sourceIp'));
    }

    const analysis: InteropApiGw5xxAnalysis = {
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
    context.logger?.text(`      ├─ Errori 5xx complessivi: ${analysis.errorCount}`);
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
    const count = parseCount(apigw.extractCwField(row, 'count'));
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
  return row === undefined ? undefined : normalize(apigw.extractCwField(row, name));
}

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === '' ? undefined : normalized;
}
