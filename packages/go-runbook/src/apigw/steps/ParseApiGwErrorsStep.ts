import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';

import { extractCwField } from '../helpers/extractCwField.js';
import { extractXRayTraceId } from '../helpers/extractXRayTraceId.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { ApiGwErrorInfo } from './ApiGwErrorInfo.js';

/**
 * Configuration for {@link parseApiGwErrors}.
 */
export interface ParseApiGwErrorsConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Step id of the CW Logs query whose output to parse */
  readonly fromStep: string;
  /** Minimum HTTP status code to include (default: 500) */
  readonly minStatusCode?: number;
}

/**
 * Mapping between the CloudWatch field name produced by the canonical
 * API GW Insights query and the var name written to the runbook context.
 *
 * Order: every entry triggers an `extractCwField` lookup on the first
 * error row and, when the field is present (and not the literal `-`
 * placeholder used by API GW for missing values), writes the associated
 * context var.
 */
const FIELD_TO_VAR: ReadonlyArray<readonly [field: string, varName: keyof ApiGwErrorInfo, contextVar: string]> = [
  ['errorMessage', 'errorMessage', 'apiGwErrorMessage'],
  ['httpMethod', 'httpMethod', 'apiGwHttpMethod'],
  ['path', 'path', 'apiGwPath'],
  ['authorizeStatus', 'authorizeStatus', 'apiGwAuthorizeStatus'],
  ['integrationServiceStatus', 'integrationServiceStatus', 'apiGwIntegrationServiceStatus'],
  ['requestId', 'requestId', 'apiGwRequestId'],
  ['authorizerRequestId', 'authorizerRequestId', 'apiGwAuthorizerRequestId'],
  ['integrationRequestId', 'integrationRequestId', 'apiGwIntegrationRequestId'],
];

class ParseApiGwErrorsStepImpl implements Step<ApiGwErrorInfo> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly minStatusCode: number;

  constructor(config: ParseApiGwErrorsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.minStatusCode = config.minStatusCode ?? 500;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<ApiGwErrorInfo>> {
    const rawOutput = context.stepResults.get(this.fromStep);
    if (rawOutput === undefined) {
      return { success: false, error: `Step output not found: "${this.fromStep}"` };
    }

    const results = rawOutput as ReadonlyArray<ResultField[]>;

    const errorRows: ResultField[][] = [];
    for (const row of results) {
      const status = extractCwField(row, 'status');
      if (status !== undefined && Number(status) >= this.minStatusCode) {
        errorRows.push([...row]);
      }
    }

    if (errorRows.length === 0) {
      if (context.logger !== undefined) {
        new ApiGwReporter(context.logger).apiGwResult({
          errorCount: 0,
          statusCode: '',
          xRayTraceId: undefined,
        });
      }
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

    const additional: Partial<ApiGwErrorInfo> = {};
    for (const [field, infoKey, contextVar] of FIELD_TO_VAR) {
      const raw = extractCwField(firstRow, field);
      if (raw === undefined) continue;
      // API Gateway uses the literal `-` to mark "not present" for these
      // fields. Persist it as a var (so case conditions can compare on
      // `-`) but skip propagating it as a meaningful info value.
      vars[contextVar] = raw;
      if (raw !== '-' && raw !== '') {
        (additional as Record<string, string>)[infoKey] = raw;
      }
    }

    if (context.logger !== undefined) {
      new ApiGwReporter(context.logger).apiGwResult({
        errorCount: errorRows.length,
        statusCode,
        xRayTraceId,
        ...(additional.errorMessage !== undefined ? { errorMessage: additional.errorMessage } : {}),
        ...(additional.path !== undefined ? { path: additional.path } : {}),
        ...(additional.httpMethod !== undefined ? { httpMethod: additional.httpMethod } : {}),
      });
    }

    return {
      success: true,
      output: {
        errorCount: errorRows.length,
        xRayTraceId,
        statusCode,
        ...additional,
      },
      vars,
    };
  }
}

/**
 * Factory: creates a step that parses API Gateway AccessLog query results.
 *
 * The step scans the rows produced by an upstream CloudWatch Logs Insights
 * query, filters them by minimum HTTP status code, then extracts the
 * X-Ray trace id, status code and the additional diagnostic fields
 * emitted by the canonical AccessLog query (`errorMessage`, `httpMethod`,
 * `path`, `authorizeStatus`, `integrationServiceStatus`, `requestId`,
 * `authorizerRequestId`, `integrationRequestId`). When no errors are
 * present the step short-circuits the runbook with `next: 'stop'`.
 *
 * Vars written:
 * - `apiGwErrorCount`: total number of error rows (always)
 * - `apiGwStatusCode`: status code of the first error row (when errors found)
 * - `xRayTraceId`: trace id of the first error row (when extractable)
 * - `apiGwErrorMessage`, `apiGwHttpMethod`, `apiGwPath`,
 *   `apiGwAuthorizeStatus`, `apiGwIntegrationServiceStatus`,
 *   `apiGwRequestId`, `apiGwAuthorizerRequestId`,
 *   `apiGwIntegrationRequestId` when the corresponding field is present
 *   in the first error row (the literal `-` produced by API Gateway is
 *   preserved as-is so case conditions can compare against it).
 *
 * @param config - Step configuration
 * @returns Step that extracts API Gateway error metadata
 */
export function parseApiGwErrors(config: ParseApiGwErrorsConfig): Step<ApiGwErrorInfo> {
  return new ParseApiGwErrorsStepImpl(config);
}
