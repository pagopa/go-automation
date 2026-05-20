import type { ResultField } from '@go-automation/go-common/aws';

import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';

import { extractCwField } from '../helpers/extractCwField.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { AccessLogSchema } from '../profiles/schemas/AccessLogSchema.js';
import { SEND_API_GW_PROFILE } from '../profiles/SEND_API_GW_PROFILE.js';
import type { ApiGwAuthorizerFailureCheckConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwAuthorizerLambdaConfig } from '../authorizers/ApiGwAuthorizerLambdaRegistry.js';

const DEFAULT_STATUS_THRESHOLD = 500;

export type ApiGwAuthorizerFailureOutcome = 'timeout' | 'error';
type ApiGwAuthorizerFailureType = 'timeout' | 'status-error';

export interface ApiGwAuthorizerFailureInfo {
  readonly outcome: ApiGwAuthorizerFailureOutcome;
  readonly failureType: ApiGwAuthorizerFailureType;
  readonly lambdaName: string;
  readonly authorizerStatus: string;
  readonly timeoutMs: number;
  readonly latencyMs?: number;
  readonly requestId?: string;
  readonly path?: string;
  readonly httpMethod?: string;
}

export interface EvaluateApiGwAuthorizerFailureConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly schema?: AccessLogSchema;
  readonly check: ApiGwAuthorizerFailureCheckConfig;
  readonly queryProfileId?: string;
}

class EvaluateApiGwAuthorizerFailureStepImpl implements Step<ApiGwAuthorizerFailureInfo | undefined> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly schema: AccessLogSchema;
  private readonly check: ApiGwAuthorizerFailureCheckConfig;
  private readonly queryProfileId: string;
  private readonly statusThreshold: number;

  constructor(config: EvaluateApiGwAuthorizerFailureConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.schema = config.schema ?? SEND_API_GW_PROFILE.accessLog.schema;
    this.check = config.check;
    this.queryProfileId = config.queryProfileId ?? SEND_API_GW_PROFILE.id;
    this.statusThreshold = config.check.statusThreshold ?? DEFAULT_STATUS_THRESHOLD;
  }

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      queryProfileId: this.queryProfileId,
      queryKind: 'access-log-authorizer-gate',
      statusThreshold: this.statusThreshold,
      defaultAuthorizer: this.check.defaultAuthorizer?.lambdaName ?? null,
      ruleCount: this.check.rules?.length ?? 0,
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<ApiGwAuthorizerFailureInfo | undefined>> {
    await Promise.resolve();
    return this.evaluate(context);
  }

  private evaluate(context: RunbookContext): StepResult<ApiGwAuthorizerFailureInfo | undefined> {
    const rawOutput = context.stepResults.get(this.fromStep);
    if (rawOutput === undefined) {
      return { success: false, error: `Step output not found: "${this.fromStep}"` };
    }
    if (this.schema.authorizer === undefined) {
      return {
        success: false,
        error:
          `API Gateway profile "${this.queryProfileId}" does not declare authorizer fields, ` +
          'but authorizerFailureCheck is enabled.',
      };
    }

    const rows = rawOutput as ReadonlyArray<ResultField[]>;
    const reporter = context.logger !== undefined ? new ApiGwReporter(context.logger) : undefined;
    const firstEvidence = this.extractEvidence(rows[0]);
    let firstError: ApiGwAuthorizerFailureInfo | undefined;

    for (const row of rows) {
      const info = this.evaluateRow(row);
      if (info === undefined) continue;
      if (info.outcome === 'timeout') {
        reporter?.apiGwAuthorizerEvaluation(toReporterInput(info));
        return this.toResolvedResult(info);
      }
      firstError ??= info;
    }

    if (firstError !== undefined) {
      reporter?.apiGwAuthorizerEvaluation(toReporterInput(firstError));
      return this.toResolvedResult(firstError);
    }

    reporter?.apiGwAuthorizerEvaluation({
      lambdaName: firstEvidence?.authorizer.lambdaName ?? this.check.defaultAuthorizer?.lambdaName ?? 'n/a',
      outcome: 'none',
      ...(firstEvidence?.authorizerStatus !== undefined ? { authorizerStatus: firstEvidence.authorizerStatus } : {}),
      ...(firstEvidence?.latencyMs !== undefined ? { authorizerLatencyMs: firstEvidence.latencyMs } : {}),
      ...(firstEvidence?.requestId !== undefined ? { authorizerRequestId: firstEvidence.requestId } : {}),
      ...(firstEvidence?.authorizer.timeoutMs !== undefined ? { timeoutMs: firstEvidence.authorizer.timeoutMs } : {}),
      ...(firstEvidence?.path !== undefined ? { path: firstEvidence.path } : {}),
      ...(firstEvidence?.httpMethod !== undefined ? { httpMethod: firstEvidence.httpMethod } : {}),
    });

    return { success: true };
  }

  private evaluateRow(row: ReadonlyArray<ResultField>): ApiGwAuthorizerFailureInfo | undefined {
    const evidence = this.extractEvidence(row);
    if (evidence === undefined) return undefined;

    const numericAuthorizerStatus =
      evidence.authorizerStatus !== undefined ? Number(evidence.authorizerStatus) : undefined;
    if (
      numericAuthorizerStatus !== undefined &&
      !Number.isNaN(numericAuthorizerStatus) &&
      numericAuthorizerStatus >= this.statusThreshold
    ) {
      const timeoutExceeded = evidence.latencyMs !== undefined && evidence.latencyMs >= evidence.authorizer.timeoutMs;
      return {
        outcome: timeoutExceeded ? 'timeout' : 'error',
        failureType: timeoutExceeded ? 'timeout' : 'status-error',
        lambdaName: evidence.authorizer.lambdaName,
        authorizerStatus: evidence.authorizerStatus as string,
        timeoutMs: evidence.authorizer.timeoutMs,
        ...(evidence.latencyMs !== undefined ? { latencyMs: evidence.latencyMs } : {}),
        ...(evidence.requestId !== undefined ? { requestId: evidence.requestId } : {}),
        ...(evidence.path !== undefined ? { path: evidence.path } : {}),
        ...(evidence.httpMethod !== undefined ? { httpMethod: evidence.httpMethod } : {}),
      };
    }

    return undefined;
  }

  private extractEvidence(row: ReadonlyArray<ResultField> | undefined): AuthorizerEvidence | undefined {
    if (row === undefined || this.schema.authorizer === undefined) return undefined;

    const path = this.sanitize(extractCwField(row, this.schema.pathField));
    const httpMethod = this.sanitize(extractCwField(row, this.schema.httpMethodField));
    const authorizer = this.selectAuthorizer(path, httpMethod);
    if (authorizer === undefined) return undefined;

    const authorizerStatus = this.pickFirstMeaningfulField(row, this.schema.authorizer.statusFields);
    const latencyMs = this.parseLatency(this.pickFirstMeaningfulField(row, this.schema.authorizer.latencyFields));
    const requestId = this.pickFirstMeaningfulField(row, this.schema.authorizer.requestIdFields);

    return {
      authorizer,
      ...(authorizerStatus !== undefined ? { authorizerStatus } : {}),
      ...(latencyMs !== undefined ? { latencyMs } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
      ...(path !== undefined ? { path } : {}),
      ...(httpMethod !== undefined ? { httpMethod } : {}),
    };
  }

  private toResolvedResult(info: ApiGwAuthorizerFailureInfo): StepResult<ApiGwAuthorizerFailureInfo | undefined> {
    const vars: Record<string, string> = {
      apiGwAuthorizerOutcome: info.outcome,
      apiGwAuthorizerFailureType: info.failureType,
      apiGwAuthorizerLambdaName: info.lambdaName,
      apiGwAuthorizerStatus: info.authorizerStatus,
      apiGwAuthorizerTimeoutMs: String(info.timeoutMs),
      apiGwAuthorizerLatencyMs: info.latencyMs !== undefined ? String(info.latencyMs) : '',
      apiGwAuthorizerRequestId: info.requestId ?? '',
      apiGwAuthorizerPath: info.path ?? '',
      apiGwAuthorizerHttpMethod: info.httpMethod ?? '',
      lastErrorMsg: buildAuthorizerMessage(info),
    };

    return {
      success: true,
      output: info,
      vars,
      next: 'resolve',
    };
  }

  private selectAuthorizer(
    path: string | undefined,
    httpMethod: string | undefined,
  ): ApiGwAuthorizerLambdaConfig | undefined {
    for (const rule of this.check.rules ?? []) {
      const pathMatches = rule.pathPrefix === undefined || (path ?? '').startsWith(rule.pathPrefix);
      const methodMatches =
        rule.httpMethod === undefined || (httpMethod ?? '').toUpperCase() === rule.httpMethod.toUpperCase();
      if (pathMatches && methodMatches) {
        return rule.authorizer;
      }
    }
    return this.check.defaultAuthorizer;
  }

  private pickFirstMeaningfulField(row: ReadonlyArray<ResultField>, fields: ReadonlyArray<string>): string | undefined {
    for (const field of fields) {
      const value = this.sanitize(extractCwField(row, field));
      if (value !== undefined) return value;
    }
    return undefined;
  }

  private sanitize(raw: string | undefined): string | undefined {
    const trimmed = (raw ?? '').trim();
    if (trimmed === '') return undefined;
    if (this.schema.notApplicableSentinels.includes(trimmed)) return undefined;
    return trimmed;
  }

  private parseLatency(raw: string | undefined): number | undefined {
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}

function buildAuthorizerMessage(info: ApiGwAuthorizerFailureInfo): string {
  const base = baseMessage(info);
  const latency = info.latencyMs !== undefined ? ` authorizerLatency=${info.latencyMs}ms` : '';
  const timeout = ` timeout=${info.timeoutMs}ms`;
  const requestId = info.requestId !== undefined ? ` authorizerRequestId=${info.requestId}` : '';
  return `${base}. authorizerStatus=${info.authorizerStatus}${latency}${timeout}${requestId}`;
}

function baseMessage(info: ApiGwAuthorizerFailureInfo): string {
  if (info.failureType === 'timeout') return `Timeout Lambda authorizer ${info.lambdaName}`;
  return `Errore Lambda authorizer ${info.lambdaName}`;
}

interface AuthorizerEvidence {
  readonly authorizer: ApiGwAuthorizerLambdaConfig;
  readonly authorizerStatus?: string;
  readonly latencyMs?: number;
  readonly requestId?: string;
  readonly path?: string;
  readonly httpMethod?: string;
}

interface ApiGwAuthorizerReporterInput {
  readonly lambdaName: string;
  readonly authorizerStatus?: string;
  readonly authorizerLatencyMs?: number;
  readonly authorizerRequestId?: string;
  readonly timeoutMs?: number;
  readonly path?: string;
  readonly httpMethod?: string;
  readonly outcome: 'none' | 'timeout' | 'error';
  readonly failureType?: string;
}

function toReporterInput(info: ApiGwAuthorizerFailureInfo): ApiGwAuthorizerReporterInput {
  return {
    lambdaName: info.lambdaName,
    outcome: info.outcome,
    failureType: info.failureType,
    authorizerStatus: info.authorizerStatus,
    ...(info.latencyMs !== undefined ? { authorizerLatencyMs: info.latencyMs } : {}),
    ...(info.requestId !== undefined ? { authorizerRequestId: info.requestId } : {}),
    timeoutMs: info.timeoutMs,
    ...(info.path !== undefined ? { path: info.path } : {}),
    ...(info.httpMethod !== undefined ? { httpMethod: info.httpMethod } : {}),
  };
}

export function evaluateApiGwAuthorizerFailure(
  config: EvaluateApiGwAuthorizerFailureConfig,
): Step<ApiGwAuthorizerFailureInfo | undefined> {
  return new EvaluateApiGwAuthorizerFailureStepImpl(config);
}
