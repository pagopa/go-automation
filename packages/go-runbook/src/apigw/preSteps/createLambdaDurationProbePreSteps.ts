import type { StepDescriptor } from '../../types/StepDescriptor.js';
import type { TimeRangeFromParams } from '../../steps/data/CloudWatchLogsQueryStep.js';
import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';

import { queryCloudWatchLogs } from '../../steps/data/CloudWatchLogsQueryStep.js';
import { renderQueryTemplate } from '../profiles/render/renderQueryTemplate.js';
import { KnownUrlsRegistry } from '../registries/KnownUrlsRegistry.js';
import { analyzeServiceLogs } from '../steps/AnalyzeServiceLogsStep.js';

const DEFAULT_ID_PREFIX = 'io-authorizer-lambda';
const DEFAULT_VAR_PREFIX = 'ioAuthorizerLambda';
const DEFAULT_THRESHOLD_MS = 5000;
const DEFAULT_TIME_RANGE_FROM_PARAMS: TimeRangeFromParams = { start: 'startTime', end: 'endTime' };
const THRESHOLD_PLACEHOLDER = '{{THRESHOLD_MS}}';
const DEFAULT_QUERY_TEMPLATE = `fields @timestamp, @message, @duration, @billedDuration
| filter @message like 'REPORT'
| filter @duration >= ${THRESHOLD_PLACEHOLDER}
| sort @timestamp desc
| limit 100`;

/**
 * Configuration for a Lambda REPORT-duration probe used as API Gateway pre-steps.
 */
export interface LambdaDurationProbePreStepsConfig {
  /**
   * CloudWatch log group of the Lambda to query.
   */
  readonly logGroup: string;
  /**
   * Stable prefix used to build generated step ids.
   *
   * Defaults to `io-authorizer-lambda`, producing
   * `query-io-authorizer-lambda` and `analyze-io-authorizer-lambda`.
   */
  readonly idPrefix?: string;
  /**
   * Human-readable Lambda label used by the generated step labels.
   *
   * Defaults to the last segment of `logGroup`.
   */
  readonly label?: string;
  /**
   * Prefix of vars written by `analyzeServiceLogs`.
   *
   * Defaults to `ioAuthorizerLambda`.
   */
  readonly varPrefix?: string;
  /**
   * Minimum Lambda duration, in milliseconds, matched by the query.
   *
   * Defaults to `5000`.
   */
  readonly thresholdMs?: number;
  /**
   * Optional service log schema passed to `analyzeServiceLogs`.
   *
   * When omitted, `analyzeServiceLogs` keeps its default schema.
   */
  readonly schema?: ServiceLogSchema;
  /**
   * Parameter names used to resolve the query time range from runbook context.
   *
   * Defaults to `{ start: 'startTime', end: 'endTime' }`.
   */
  readonly timeRangeFromParams?: TimeRangeFromParams;
  /**
   * Advanced override for the CloudWatch Logs Insights query template.
   *
   * The template must contain `{{THRESHOLD_MS}}`.
   */
  readonly queryTemplate?: string;
  /**
   * Additional metadata propagated to the query step trace.
   */
  readonly traceMetadata?: Readonly<Record<string, unknown>>;
}

/**
 * Creates the standard two pre-steps used to probe Lambda REPORT duration
 * before the API Gateway service traversal starts.
 *
 * @param config - Probe configuration
 * @returns Query and analysis step descriptors
 */
export function createLambdaDurationProbePreSteps(
  config: LambdaDurationProbePreStepsConfig,
): ReadonlyArray<StepDescriptor> {
  const normalized = normalizeConfig(config);
  const queryStepId = `query-${normalized.idPrefix}`;
  const analyzeStepId = `analyze-${normalized.idPrefix}`;
  const query = renderQueryTemplate(normalized.queryTemplate, {
    values: { [THRESHOLD_PLACEHOLDER]: String(normalized.thresholdMs) },
    queryId: `${normalized.idPrefix}.lambdaDurationProbe`,
  });
  const emptyRegistry = new KnownUrlsRegistry([]);

  return [
    {
      step: queryCloudWatchLogs({
        id: queryStepId,
        label: `Query log ${normalized.label} (Livello 0)`,
        logGroups: [normalized.logGroup],
        query,
        timeRangeFromParams: normalized.timeRangeFromParams,
        logGroupResolutionMode: 'search-configured-profiles',
        traceMetadata: {
          queryKind: 'lambda-duration-probe',
          identifierMode: 'none',
          probeId: normalized.idPrefix,
          ...normalized.traceMetadata,
        },
      }),
      continueOnFailure: true,
      silent: true,
    },
    {
      step: analyzeServiceLogs({
        id: analyzeStepId,
        label: `Analisi log ${normalized.label}`,
        fromStep: queryStepId,
        varPrefix: normalized.varPrefix,
        registry: emptyRegistry,
        quiet: true,
        ...(normalized.schema !== undefined ? { schema: normalized.schema } : {}),
      }),
      continueOnFailure: true,
      silent: true,
    },
  ];
}

interface NormalizedLambdaDurationProbePreStepsConfig {
  readonly logGroup: string;
  readonly idPrefix: string;
  readonly label: string;
  readonly varPrefix: string;
  readonly thresholdMs: number;
  readonly schema?: ServiceLogSchema;
  readonly timeRangeFromParams: TimeRangeFromParams;
  readonly queryTemplate: string;
  readonly traceMetadata?: Readonly<Record<string, unknown>>;
}

function normalizeConfig(config: LambdaDurationProbePreStepsConfig): NormalizedLambdaDurationProbePreStepsConfig {
  const logGroup = requireNonEmpty(config.logGroup, 'logGroup');
  const idPrefix = requireNonEmpty(config.idPrefix ?? DEFAULT_ID_PREFIX, 'idPrefix');
  const label = requireNonEmpty(config.label ?? labelFromLogGroup(logGroup), 'label');
  const varPrefix = requireNonEmpty(config.varPrefix ?? DEFAULT_VAR_PREFIX, 'varPrefix');
  const thresholdMs = config.thresholdMs ?? DEFAULT_THRESHOLD_MS;
  const queryTemplate = config.queryTemplate ?? DEFAULT_QUERY_TEMPLATE;

  if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) {
    throw new Error('Lambda duration probe thresholdMs must be a positive finite number');
  }
  if (!queryTemplate.includes(THRESHOLD_PLACEHOLDER)) {
    throw new Error(`Lambda duration probe queryTemplate must contain ${THRESHOLD_PLACEHOLDER}`);
  }
  if (config.schema?.messageFieldCandidates.length === 0) {
    throw new Error('Lambda duration probe schema.messageFieldCandidates must contain at least one field');
  }

  return {
    logGroup,
    idPrefix,
    label,
    varPrefix,
    thresholdMs,
    timeRangeFromParams: config.timeRangeFromParams ?? DEFAULT_TIME_RANGE_FROM_PARAMS,
    queryTemplate,
    ...(config.schema !== undefined ? { schema: config.schema } : {}),
    ...(config.traceMetadata !== undefined ? { traceMetadata: config.traceMetadata } : {}),
  };
}

function requireNonEmpty(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized === '') {
    throw new Error(`Lambda duration probe ${fieldName} must be a non-empty string`);
  }
  return normalized;
}

function labelFromLogGroup(logGroup: string): string {
  const segments = logGroup.split('/').filter((segment) => segment.length > 0);
  return segments.at(-1) ?? logGroup;
}
