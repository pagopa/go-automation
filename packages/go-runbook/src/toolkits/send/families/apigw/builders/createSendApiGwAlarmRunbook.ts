import { AlarmRunbookBuilder } from '../../../../common/builders/AlarmRunbookBuilder.js';
import { CloudWatchLogsQueryStep } from '../../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
import type { Runbook } from '../../../../../engine/types/Runbook.js';
import type { ApiGwPipelineAnchor } from '../types/ApiGwPipelineAnchor.js';
import { applyPipelineHooks } from '../../../../../engine/builders/applyPipelineHooks.js';
import { finishAlarmRunbook } from '../../../../common/builders/finishAlarmRunbook.js';

import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';

import { ParseApiGwErrorsStep } from '../../../../common/families/apigw/steps/ParseApiGwErrorsStep.js';
import { PrepareApiGwSectionStep } from '../../../../common/families/apigw/steps/PrepareApiGwSectionStep.js';
import { QueryServiceLogsStep } from '../steps/QueryServiceLogsStep.js';
import { AnalyzeTraversedServiceLogsStep } from '../steps/AnalyzeTraversedServiceLogsStep.js';
import { DecideNextStep } from '../steps/DecideNextStep.js';
import { QueryApiGwExecutionLogsStep } from '../../../../common/families/apigw/steps/QueryApiGwExecutionLogsStep.js';
import { StopApiGwExecutionLogAnalysisStep } from '../../../../common/families/apigw/steps/StopApiGwExecutionLogAnalysisStep.js';
import { EvaluateApiGwAuthorizerFailureStep } from '../../../../common/families/apigw/steps/EvaluateApiGwAuthorizerFailureStep.js';
import { builtinApiGwAuthorizerKnownCases } from '../../../../common/families/apigw/knownCases/authorizerKnownCases.js';
import { defaultSendApiGwUnknownCaseFallback } from './defaultSendApiGwUnknownCaseFallback.js';
import { resolveApiGwAlarmBuildContext } from './resolveApiGwAlarmBuildContext.js';

/**
 * Assembla un runbook API Gateway completo a partire da input dichiarativi.
 *
 * @param config - Configurazione del runbook
 * @returns Un {@link Runbook} validato pronto per l'engine
 */
export function createSendApiGwAlarmRunbook(config: ApiGwAlarmConfig): Runbook {
  const ctx = resolveApiGwAlarmBuildContext(config);
  const { profile, minStatus, apiGwQuery, registry, allServices, servicesInRunbook, hooks } = ctx;
  const reachedAnchors = new Set<ApiGwPipelineAnchor>();
  const executionLogAnalysisMode = config.executionLogAnalysisMode ?? 'terminal';

  const builder = AlarmRunbookBuilder.create(config.id)
    .metadata(config.metadata)
    .cloudExecutionPolicy({ sideEffects: 'NONE' });

  // 1. Banner.
  builder.step(
    new PrepareApiGwSectionStep({
      id: 'prepare-api-gw-section',
      label: 'Preparazione API Gateway',
      apiGwLogGroup: config.apiGwLogGroup,
    }),
    { silent: true },
  );

  // 2. AccessLog query (con traceMetadata cross-prodotto).
  builder.step(
    new CloudWatchLogsQueryStep({
      id: 'query-api-gw-logs',
      label: 'Query API Gateway AccessLog per errori HTTP',
      logGroups: [config.apiGwLogGroup],
      query: apiGwQuery,
      ...(ctx.apiGwFallbackQuery !== undefined ? { emptyResultFallbackQuery: ctx.apiGwFallbackQuery } : {}),
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
      logGroupResolutionMode: 'search-configured-profiles',
      ...(config.paginateAccessLogResults !== undefined ? { paginateResults: config.paginateAccessLogResults } : {}),
      traceMetadata: {
        queryProfileId: profile.id,
        queryKind: 'access-log',
        identifierMode: 'none',
      },
    }),
    { silent: true },
  );

  // 3. Parse AccessLog → trace id, status, vars. Must stay under the
  // preparation section in the console output, before authorizer/execution
  // log sections open their own banners.
  builder.step(
    new ParseApiGwErrorsStep({
      id: 'parse-api-gw-errors',
      label: `Estrazione ${profile.accessLog.schema.traceIdLabel} e metadati API Gateway`,
      fromStep: 'query-api-gw-logs',
      minStatusCode: minStatus,
      schema: profile.accessLog.schema,
      queryProfileId: profile.id,
    }),
    { silent: true },
  );

  // 4. Authorizer gate (condizionale, prima di ogni trace-id flow).
  if (config.authorizerFailureCheck !== undefined) {
    builder.step(
      new EvaluateApiGwAuthorizerFailureStep({
        id: 'evaluate-api-gw-authorizer-failure',
        label: 'Valutazione Lambda authorizer API Gateway',
        fromStep: 'query-api-gw-logs',
        schema: profile.accessLog.schema,
        check: config.authorizerFailureCheck,
        queryProfileId: profile.id,
      }),
      { silent: true },
    );
  }

  // 5. ExecutionLog branch (condizionale).
  if (ctx.executionLogEnabled && profile.executionLog !== undefined && ctx.effectiveExecutionLogGroup !== undefined) {
    builder.step(
      new QueryApiGwExecutionLogsStep({
        id: 'query-api-gw-execution-logs',
        label: 'Query API Gateway ExecutionLog per requestId',
        fromStep: 'query-api-gw-logs',
        minStatusCode: minStatus,
        timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        spec: profile.executionLog,
        accessLogSchema: profile.accessLog.schema,
        queryProfileId: profile.id,
        executionLogGroup: ctx.effectiveExecutionLogGroup,
        analysisMode: executionLogAnalysisMode,
        ...(config.executionLogMaxRequestIds !== undefined
          ? { maxRequestIdsOverride: config.executionLogMaxRequestIds }
          : {}),
      }),
      {
        silent: true,
        evidence: [
          {
            id: 'api-gw-execution-logs',
            label: 'API Gateway execution logs per richiesta',
            type: 'log-sample',
            retention: { mode: 'latest', limit: 5, timestampField: '@timestamp' },
          },
        ],
      },
    );

    if (executionLogAnalysisMode === 'terminal') {
      builder.step(
        new StopApiGwExecutionLogAnalysisStep({
          id: 'stop-api-gw-execution-log-unresolved',
          label: 'Stop se execution log API Gateway non determinante',
        }),
        { silent: true },
      );
    }
  }

  // 6. Custom steps declared for this point of the pipeline.
  applyPipelineHooks(builder, hooks, 'before-service-traversal', reachedAnchors);

  // 7. Per-service triplets.
  for (const service of allServices) {
    builder.step(
      new QueryServiceLogsStep({
        id: `query-${service.name}`,
        label: `Query log ${service.name}`,
        serviceName: service.name,
        entryService: service.name === config.entryService.name,
        logGroups: [service.logGroup],
        spec: profile.serviceLog,
        queryProfileId: profile.id,
        accessLogSchemaTraceIdContextVar: profile.accessLog.schema.traceIdContextVar,
        timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        ...(service.queryOverride !== undefined ? { queryTemplateOverride: service.queryOverride } : {}),
      }),
      { silent: true },
    );

    builder.step(
      new AnalyzeTraversedServiceLogsStep({
        id: `analyze-${service.name}`,
        label: `Analisi log ${service.name}`,
        fromStep: `query-${service.name}`,
        varPrefix: service.varPrefix,
        registry,
        serviceName: service.name,
        schema: profile.serviceLog.schema,
      }),
      { silent: true },
    );

    if (service.name === config.entryService.name) {
      applyPipelineHooks(builder, hooks, 'after-entry-analysis', reachedAnchors);
    }

    builder.step(
      new DecideNextStep({
        id: `decide-${service.name}`,
        label: `Decisione flusso per ${service.name}`,
        serviceName: service.name,
        varPrefix: service.varPrefix,
        servicesInRunbook,
        traceIdContextVar: profile.accessLog.schema.traceIdContextVar,
      }),
      { silent: true },
    );
  }

  // 8. Known cases.
  for (const knownCase of builtinApiGwAuthorizerKnownCases(config.authorizerFailureCheck)) {
    builder.knownCase(knownCase);
  }
  // 9. Known cases, fallback, context, analysis defaults, iteration cap, build.
  return finishAlarmRunbook(builder, config, {
    builderName: 'createSendApiGwAlarmRunbook',
    defaultFallback: () =>
      defaultSendApiGwUnknownCaseFallback(
        allServices,
        profile.accessLog.schema.traceIdContextVar,
        profile.accessLog.schema.traceIdLabel,
      ),
    runbookContext: { ...ctx.runbookContext },
    primaryResource: config.entryService.name,
    anchors: { hooks, reached: reachedAnchors, pipelineName: 'API Gateway' },
  });
}
