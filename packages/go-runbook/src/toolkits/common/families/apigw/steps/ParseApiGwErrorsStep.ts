import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { omitUndefined } from '@pagopa/go-common/utils';
import type { RunbookContext, Step, StepKind, StepResult } from '../../../../../engine/index.js';
import { readStepOutput } from '../../../../../engine/index.js';

import { extractTraceId } from '../accessLog/extractTraceId.js';
import {
  pickHighestStatusCode,
  pickPrimaryStatusCode,
  readAccessLogField,
  rowMeetsThreshold,
} from '../accessLog/accessLogRow.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { ApiGwErrorInfo } from '../accessLog/ApiGwErrorInfo.js';
import type { AccessLogSchema } from '../accessLog/AccessLogSchema.js';

/**
 * Configuration for {@link ParseApiGwErrorsStep}.
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
  /**
   * Schema dei campi prodotti dalla query AccessLog (dal profilo del prodotto).
   */
  readonly schema: AccessLogSchema;
  /**
   * Identificatore del profilo (per i metadati del trace).
   */
  readonly queryProfileId: string;
}

/**
 * Reads the error of the request from the API Gateway access-log rows: status codes, path, method, error message and
 * trace id, published as variables.
 */
export class ParseApiGwErrorsStep implements Step<ApiGwErrorInfo> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly minStatusCode: number;
  private readonly schema: AccessLogSchema;
  private readonly queryProfileId: string;

  constructor(config: ParseApiGwErrorsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.minStatusCode = config.minStatusCode ?? 500;
    this.schema = config.schema;
    this.queryProfileId = config.queryProfileId;
  }

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      queryProfileId: this.queryProfileId,
      queryKind: 'access-log-parse',
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<ApiGwErrorInfo>> {
    const upstream = readStepOutput<ReadonlyArray<GOLogsInsightsResultField[]>>(context, this.fromStep);
    if (!upstream.ok) return upstream.failure;
    const results = upstream.value;

    // The canonical API GW query filters on `status OR authorizerStatus
    // OR integrationServiceStatus`; keep any row whose status fields
    // surface an error on **at least one** of those, otherwise we
    // would silently drop rows whose only signal is on
    // `authorizerStatus` or `integrationServiceStatus`
    // (e.g. an authorizer 500 with `status=-`).
    // Rows are only ever read downstream (extractTraceId, pickPrimaryStatusCode,
    // readRowField) — no defensive clone needed.
    const errorRows: GOLogsInsightsResultField[][] = [];
    for (const row of results) {
      if (rowMeetsThreshold(row, this.minStatusCode, this.schema)) {
        errorRows.push(row);
      }
    }

    const firstRow = this.mostSevereErrorRow(errorRows);
    if (firstRow === undefined) {
      new ApiGwReporter(context.services.reporter).apiGwResult({
        errorCount: 0,
        statusCode: '',
        traceId: undefined,
        traceIdLabel: this.schema.traceIdLabel,
      });
      return {
        success: true,
        output: { errorCount: 0, xRayTraceId: undefined, statusCode: '' },
        vars: { apiGwErrorCount: '0' },
        next: 'stop',
      };
    }

    const traceId = extractTraceId(firstRow, this.schema);
    // La canonica query AccessLog OR-filtra su 3 status field, quindi
    // `status` da solo può essere il letterale `-` anche quando la riga è
    // un errore (authorizer / integration failure). Prendi il primo
    // valore numerico nell'ordine canonico così `apiGwStatusCode` è
    // sempre il più significativo.
    const statusCode = pickPrimaryStatusCode(firstRow, this.schema);

    const vars: Record<string, string> = {
      apiGwErrorCount: String(errorRows.length),
      apiGwStatusCode: statusCode,
    };

    if (traceId !== undefined) {
      vars[this.schema.traceIdContextVar] = traceId;
    }

    const additional: Partial<ApiGwErrorInfo> = {};
    for (const [field, contextVar] of this.schema.fieldToVar) {
      const raw = readRowField(firstRow, field);
      if (raw === undefined) continue;
      // API Gateway uses the literal `-` to mark "not present" for these
      // fields. Persist it as a var (so case conditions can compare on
      // `-`) but skip propagating it as a meaningful info value.
      vars[contextVar] = raw;
      const value = readAccessLogField(firstRow, field, this.schema);
      if (value !== undefined) {
        // Map the well-known semantic fields onto the typed output.
        const semanticKey = this.semanticKeyForField(field);
        if (semanticKey !== undefined) {
          (additional as Record<string, string>)[semanticKey] = value;
        }
      }
    }

    new ApiGwReporter(context.services.reporter).apiGwResult({
      errorCount: errorRows.length,
      statusCode,
      traceId,
      traceIdLabel: this.schema.traceIdLabel,
      ...omitUndefined({
        errorMessage: additional.errorMessage,
        path: additional.path,
        httpMethod: additional.httpMethod,
      }),
    });

    return {
      success: true,
      output: {
        errorCount: errorRows.length,
        xRayTraceId: traceId,
        statusCode,
        ...additional,
      },
      vars,
    };
  }

  /** The error row with the highest status code, the first one on ties; nothing when there is no row. */
  private mostSevereErrorRow(
    rows: ReadonlyArray<GOLogsInsightsResultField[]>,
  ): GOLogsInsightsResultField[] | undefined {
    let mostSevere: GOLogsInsightsResultField[] | undefined;
    let highest = -1;
    for (const row of rows) {
      const statusCode = pickHighestStatusCode(row, this.schema) ?? -1;
      if (mostSevere === undefined || statusCode > highest) {
        mostSevere = row;
        highest = statusCode;
      }
    }
    return mostSevere;
  }

  /**
   * Mappa il nome di campo CloudWatch sul corrispondente campo semantico
   * di {@link ApiGwErrorInfo}. Solo i campi semantici "noti" del tipo
   * vengono propagati nell'output tipizzato; gli altri vivono solo in
   * `vars`.
   */
  private semanticKeyForField(field: string): keyof ApiGwErrorInfo | undefined {
    if (field === this.schema.errorMessageField) return 'errorMessage';
    if (field === this.schema.pathField) return 'path';
    if (field === this.schema.httpMethodField) return 'httpMethod';
    if (field === this.schema.requestIdField) return 'requestId';
    // Campi non-semantici noti del tipo ApiGwErrorInfo, mappati per nome.
    if (field === 'authorizerStatus') return 'authorizerStatus';
    if (field === 'authorizerLatency') return 'authorizerLatency';
    if (field === 'authorizerRequestId') return 'authorizerRequestId';
    if (field === 'integrationServiceStatus') return 'integrationServiceStatus';
    if (field === 'integrationRequestId') return 'integrationRequestId';
    return undefined;
  }
}
