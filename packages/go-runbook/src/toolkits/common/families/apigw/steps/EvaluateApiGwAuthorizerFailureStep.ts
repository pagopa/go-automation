import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { omitUndefined } from '@pagopa/go-common/utils';
import type { RunbookContext, Step, StepKind, StepResult } from '../../../../../engine/index.js';
import { readStepOutput } from '../../../../../engine/index.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { AccessLogSchema } from '../accessLog/AccessLogSchema.js';
import { readAccessLogField } from '../accessLog/accessLogRow.js';
import type { ApiGwAuthorizerFailureCheckConfig } from '../types/ApiGwAuthorizerFailureCheckConfig.js';
import type { ApiGwAuthorizerLambdaConfig } from '../types/ApiGwAuthorizerLambdaConfig.js';
import type { CloudWatchLogsRow } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';
import type { CloudWatchLogsRows } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';
import type { ApiGwAuthorizerFailureInfo } from './ApiGwAuthorizerFailureInfo.js';
import type { ApiGwAuthorizerReporterInput } from '../reporting/ApiGwAuthorizerReporterInput.js';
import type { AuthorizerEvidence } from './AuthorizerEvidence.js';
import type { EvaluateApiGwAuthorizerFailureConfig } from './EvaluateApiGwAuthorizerFailureConfig.js';

const DEFAULT_STATUS_THRESHOLD = 500;

/**
 * Checks the Lambda authorizer on the access-log rows of the request: an authorizer status at or above the threshold
 * is a timeout when the latency reaches the timeout of the authorizer, an error otherwise, and stops the chain.
 */
export class EvaluateApiGwAuthorizerFailureStep implements Step<ApiGwAuthorizerFailureInfo | undefined> {
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
    this.schema = config.schema;
    this.check = config.check;
    this.queryProfileId = config.queryProfileId;
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
    const upstream = readStepOutput<ReadonlyArray<GOLogsInsightsResultField[]>>(context, this.fromStep);
    if (!upstream.ok) return upstream.failure;
    if (this.schema.authorizer === undefined) {
      return {
        success: false,
        error:
          `API Gateway profile "${this.queryProfileId}" does not declare authorizer fields, ` +
          'but authorizerFailureCheck is enabled.',
      };
    }

    const rows: CloudWatchLogsRows = upstream.value;
    const reporter = new ApiGwReporter(context.services.reporter);
    // The rows of one request: a timeout explains it best, then the first authorizer error.
    let failure: ApiGwAuthorizerFailureInfo | undefined;
    for (const row of rows) {
      const info = this.evaluateRow(row);
      if (info === undefined) continue;
      failure ??= info;
      if (info.outcome === 'timeout') {
        failure = info;
        break;
      }
    }
    if (failure !== undefined) {
      reporter.apiGwAuthorizerEvaluation(toReporterInput(failure));
      return this.toResolvedResult(failure);
    }

    const firstEvidence = this.extractEvidence(rows[0]);
    reporter.apiGwAuthorizerEvaluation({
      lambdaName: firstEvidence?.authorizer.lambdaName ?? this.check.defaultAuthorizer?.lambdaName ?? 'n/a',
      outcome: 'none',
      ...omitUndefined({
        authorizerStatus: firstEvidence?.authorizerStatus,
        authorizerLatencyMs: firstEvidence?.latencyMs,
        authorizerRequestId: firstEvidence?.requestId,
        timeoutMs: firstEvidence?.authorizer.timeoutMs,
        path: firstEvidence?.path,
        httpMethod: firstEvidence?.httpMethod,
      }),
    });

    return this.toNoErrorResult(firstEvidence);
  }

  private evaluateRow(row: CloudWatchLogsRow): ApiGwAuthorizerFailureInfo | undefined {
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
        ...omitUndefined({
          latencyMs: evidence.latencyMs,
          requestId: evidence.requestId,
          path: evidence.path,
          httpMethod: evidence.httpMethod,
        }),
      };
    }

    return undefined;
  }

  private extractEvidence(row: CloudWatchLogsRow | undefined): AuthorizerEvidence | undefined {
    if (row === undefined || this.schema.authorizer === undefined) return undefined;

    const path = readAccessLogField(row, this.schema.pathField, this.schema);
    const httpMethod = readAccessLogField(row, this.schema.httpMethodField, this.schema);
    const authorizer = this.selectAuthorizer(path, httpMethod);
    if (authorizer === undefined) return undefined;

    const authorizerStatus = this.pickFirstMeaningfulField(row, this.schema.authorizer.statusFields);
    const latencyMs = this.parseLatency(this.pickFirstMeaningfulField(row, this.schema.authorizer.latencyFields));
    const requestId = this.pickFirstMeaningfulField(row, this.schema.authorizer.requestIdFields);

    return {
      authorizer,
      ...omitUndefined({ authorizerStatus, latencyMs, requestId, path, httpMethod }),
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
      apiGwAuthorizerDetail: buildAuthorizerMessage(info),
      lastErrorMsg: buildAuthorizerMessage(info),
    };

    // The authorizer rejected the request before the integration: no backend was called, the chain ends.
    return { success: true, output: info, vars, next: 'stop' };
  }

  private toNoErrorResult(
    evidence: AuthorizerEvidence | undefined,
  ): StepResult<ApiGwAuthorizerFailureInfo | undefined> {
    const authorizer = evidence?.authorizer ?? this.check.defaultAuthorizer;
    return {
      success: true,
      output: undefined,
      vars: {
        apiGwAuthorizerOutcome: 'no-error',
        apiGwAuthorizerFailureType: '',
        apiGwAuthorizerLambdaName: authorizer?.lambdaName ?? '',
        apiGwAuthorizerStatus: evidence?.authorizerStatus ?? '',
        apiGwAuthorizerTimeoutMs: authorizer?.timeoutMs !== undefined ? String(authorizer.timeoutMs) : '',
        apiGwAuthorizerLatencyMs: evidence?.latencyMs !== undefined ? String(evidence.latencyMs) : '',
        apiGwAuthorizerRequestId: evidence?.requestId ?? '',
        apiGwAuthorizerPath: evidence?.path ?? '',
        apiGwAuthorizerHttpMethod: evidence?.httpMethod ?? '',
      },
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

  private pickFirstMeaningfulField(row: CloudWatchLogsRow, fields: ReadonlyArray<string>): string | undefined {
    for (const field of fields) {
      const value = readAccessLogField(row, field, this.schema);
      if (value !== undefined) return value;
    }
    return undefined;
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

function toReporterInput(info: ApiGwAuthorizerFailureInfo): ApiGwAuthorizerReporterInput {
  return {
    lambdaName: info.lambdaName,
    outcome: info.outcome,
    failureType: info.failureType,
    authorizerStatus: info.authorizerStatus,
    timeoutMs: info.timeoutMs,
    ...omitUndefined({
      authorizerLatencyMs: info.latencyMs,
      authorizerRequestId: info.requestId,
      path: info.path,
      httpMethod: info.httpMethod,
    }),
  };
}
