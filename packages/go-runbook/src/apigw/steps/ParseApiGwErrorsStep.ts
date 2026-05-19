import type { ResultField } from '@go-automation/go-common/aws';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';

import { extractCwField } from '../helpers/extractCwField.js';
import { extractTraceId } from '../helpers/extractTraceId.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { ApiGwErrorInfo } from './ApiGwErrorInfo.js';
import type { AccessLogSchema } from '../profiles/schemas/AccessLogSchema.js';
import { SEND_API_GW_PROFILE } from '../profiles/SEND_API_GW_PROFILE.js';

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
  /**
   * Schema dei campi prodotti dalla query AccessLog. Quando omesso, viene
   * usato lo schema del profilo SEND di default per compatibilita con i
   * runbook esistenti. Profili non-SEND devono passarlo esplicitamente.
   */
  readonly schema?: AccessLogSchema;
  /**
   * Identificatore del profilo (per i metadati del trace). Default `'send'`.
   */
  readonly queryProfileId?: string;
}

class ParseApiGwErrorsStepImpl implements Step<ApiGwErrorInfo> {
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
    this.schema = config.schema ?? SEND_API_GW_PROFILE.accessLog.schema;
    this.queryProfileId = config.queryProfileId ?? SEND_API_GW_PROFILE.id;
  }

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      queryProfileId: this.queryProfileId,
      queryKind: 'access-log-parse',
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<ApiGwErrorInfo>> {
    const rawOutput = context.stepResults.get(this.fromStep);
    if (rawOutput === undefined) {
      return { success: false, error: `Step output not found: "${this.fromStep}"` };
    }

    const results = rawOutput as ReadonlyArray<ResultField[]>;

    // The canonical API GW query filters on `status OR authorizeStatus
    // OR integrationServiceStatus`; keep any row whose status fields
    // surface an error on **at least one** of those three, otherwise we
    // would silently drop rows whose only signal is on
    // `authorizeStatus` or `integrationServiceStatus` (e.g. an
    // authorizer 500 with `status=-`).
    const errorRows: ResultField[][] = [];
    for (const row of results) {
      if (this.rowMeetsThreshold(row)) {
        errorRows.push([...row]);
      }
    }

    if (errorRows.length === 0) {
      if (context.logger !== undefined) {
        new ApiGwReporter(context.logger).apiGwResult({
          errorCount: 0,
          statusCode: '',
          traceId: undefined,
          traceIdLabel: this.schema.traceIdLabel,
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
    const traceId = extractTraceId(firstRow, this.schema);
    // La canonica query AccessLog OR-filtra su 3 status field, quindi
    // `status` da solo può essere il letterale `-` anche quando la riga è
    // un errore (authorizer / integration failure). Prendi il primo
    // valore numerico nell'ordine canonico così `apiGwStatusCode` è
    // sempre il più significativo.
    const statusCode = this.pickPrimaryStatusCode(firstRow);

    const vars: Record<string, string> = {
      apiGwErrorCount: String(errorRows.length),
      apiGwStatusCode: statusCode,
    };

    if (traceId !== undefined) {
      vars[this.schema.traceIdContextVar] = traceId;
    }

    const additional: Partial<ApiGwErrorInfo> = {};
    for (const [field, contextVar] of this.schema.fieldToVar) {
      const raw = extractCwField(firstRow, field);
      if (raw === undefined) continue;
      // API Gateway uses the literal `-` to mark "not present" for these
      // fields. Persist it as a var (so case conditions can compare on
      // `-`) but skip propagating it as a meaningful info value.
      vars[contextVar] = raw;
      if (!this.isNotApplicable(raw) && raw !== '') {
        // Map the well-known semantic fields onto the typed output.
        const semanticKey = this.semanticKeyForField(field);
        if (semanticKey !== undefined) {
          (additional as Record<string, string>)[semanticKey] = raw;
        }
      }
    }

    if (context.logger !== undefined) {
      new ApiGwReporter(context.logger).apiGwResult({
        errorCount: errorRows.length,
        statusCode,
        traceId,
        traceIdLabel: this.schema.traceIdLabel,
        ...(additional.errorMessage !== undefined ? { errorMessage: additional.errorMessage } : {}),
        ...(additional.path !== undefined ? { path: additional.path } : {}),
        ...(additional.httpMethod !== undefined ? { httpMethod: additional.httpMethod } : {}),
      });
    }

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

  private isNotApplicable(value: string): boolean {
    return this.schema.notApplicableSentinels.includes(value);
  }

  /**
   * Returns `true` when at least one of the configured status fields
   * parses to a number ≥ {@link minStatusCode}. Values listed in
   * {@link AccessLogSchema.notApplicableSentinels} are skipped.
   */
  private rowMeetsThreshold(row: ReadonlyArray<ResultField>): boolean {
    for (const field of this.schema.statusFields) {
      const raw = extractCwField(row, field);
      if (raw === undefined) continue;
      if (this.isNotApplicable(raw)) continue;
      const num = Number(raw);
      if (!Number.isNaN(num) && num >= this.minStatusCode) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the first numeric value among the configured status fields,
   * in declaration order. Used to populate `apiGwStatusCode` so known-case
   * conditions and the reporter receive a meaningful code even when the
   * row's error signal is on a secondary field.
   */
  private pickPrimaryStatusCode(row: ReadonlyArray<ResultField>): string {
    for (const field of this.schema.statusFields) {
      const raw = extractCwField(row, field);
      if (raw === undefined) continue;
      if (this.isNotApplicable(raw)) continue;
      if (!Number.isNaN(Number(raw))) {
        return raw;
      }
    }
    return '';
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
    if (field === 'authorizeStatus') return 'authorizeStatus';
    if (field === 'integrationServiceStatus') return 'integrationServiceStatus';
    if (field === 'authorizerRequestId') return 'authorizerRequestId';
    if (field === 'integrationRequestId') return 'integrationRequestId';
    return undefined;
  }
}

/**
 * Factory: creates a step that parses API Gateway AccessLog query results.
 *
 * The step scans the rows produced by an upstream CloudWatch Logs Insights
 * query, filters them by minimum HTTP status code, then extracts the
 * trace id, status code and the additional diagnostic fields declared by
 * `schema.fieldToVar`. When no errors are present the step short-circuits
 * the runbook with `next: 'stop'`.
 *
 * V04: lo schema dei campi è letto dal profilo (default SEND per
 * back-compat). I nomi degli helper sono generici: `extractTraceId` legge
 * `schema.traceIdField` e scrive `vars[schema.traceIdContextVar]`.
 *
 * Vars written:
 * - `apiGwErrorCount`: total number of error rows (always)
 * - `apiGwStatusCode`: status code of the first error row (when errors found)
 * - `<schema.traceIdContextVar>`: trace id of the first error row (when extractable)
 * - tutti i campi `schema.fieldToVar` quando presenti nel primo row
 *
 * @param config - Step configuration
 * @returns Step that extracts API Gateway error metadata
 */
export function parseApiGwErrors(config: ParseApiGwErrorsConfig): Step<ApiGwErrorInfo> {
  return new ParseApiGwErrorsStepImpl(config);
}
