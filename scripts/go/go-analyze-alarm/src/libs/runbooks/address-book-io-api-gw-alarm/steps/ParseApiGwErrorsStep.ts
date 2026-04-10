/**
 * Custom step that parses API Gateway AccessLog results.
 *
 * Takes the output of a CloudWatch Logs query on the API GW AccessLog,
 * filters rows by minimum status code, extracts the xRayTraceId from
 * the first error, and saves findings to context variables.
 *
 * Saves vars:
 * - `apiGwErrorCount`: number of errors found
 * - `xRayTraceId`: trace ID from the first error (if found)
 * - `apiGwStatusCode`: HTTP status code from the first error
 *
 * Returns `next: 'stop'` if no errors are found.
 */

import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import type * as Runbook from '@go-automation/go-runbook';

import { extractCwField, extractXRayTraceId } from './cwLogsHelpers.js';

/**
 * Configuration for ParseApiGwErrorsStep.
 */
interface ParseApiGwErrorsConfig {
  readonly id: string;
  readonly label: string;
  /** Step ID of the CW Logs query whose output to parse */
  readonly fromStep: string;
  /** Minimum HTTP status code to include (default: 500) */
  readonly minStatusCode?: number;
}

/**
 * Parsed API Gateway error info.
 */
interface ApiGwErrorInfo {
  readonly errorCount: number;
  readonly xRayTraceId: string | undefined;
  readonly statusCode: string;
}

class ParseApiGwErrorsStepImpl implements Runbook.Step<ApiGwErrorInfo> {
  readonly id: string;
  readonly label: string;
  readonly kind: Runbook.StepKind = 'transform';

  private readonly fromStep: string;
  private readonly minStatusCode: number;

  constructor(config: ParseApiGwErrorsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.minStatusCode = config.minStatusCode ?? 500;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: Runbook.RunbookContext): Promise<Runbook.StepResult<ApiGwErrorInfo>> {
    const rawOutput = context.stepResults.get(this.fromStep);
    if (rawOutput === undefined) {
      return { success: false, error: `Step output not found: "${this.fromStep}"` };
    }

    const results = rawOutput as ReadonlyArray<ResultField[]>;

    // Filter rows by status code
    const errorRows: ResultField[][] = [];
    for (const row of results) {
      const status = extractCwField(row, 'status');
      if (status !== undefined && Number(status) >= this.minStatusCode) {
        errorRows.push([...row]);
      }
    }

    if (errorRows.length === 0) {
      return {
        success: true,
        output: { errorCount: 0, xRayTraceId: undefined, statusCode: '' },
        vars: { apiGwErrorCount: '0' },
        next: 'stop',
      };
    }

    if (errorRows[0] === undefined) {
      return { success: false, error: 'Unexpected empty row in results' };
    }

    const firstRow = errorRows[0];
    const xRayTraceId = extractXRayTraceId(firstRow);
    const statusCode = extractCwField(firstRow, 'status') ?? '';

    const vars: Record<string, string> = {
      apiGwErrorCount: String(errorRows.length),
      apiGwStatusCode: statusCode,
    };

    if (xRayTraceId !== undefined) {
      vars['xRayTraceId'] = xRayTraceId;
    }

    return {
      success: true,
      output: {
        errorCount: errorRows.length,
        xRayTraceId,
        statusCode,
      },
      vars,
    };
  }
}

/**
 * Factory: Creates a step that parses API Gateway AccessLog results.
 *
 * @param config - Step configuration
 * @returns A step that extracts error info from API GW logs
 */
export function parseApiGwErrors(config: ParseApiGwErrorsConfig): Runbook.Step<ApiGwErrorInfo> {
  return new ParseApiGwErrorsStepImpl(config);
}
