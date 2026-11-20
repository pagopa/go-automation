import { AlarmRunbookBuilder } from '../../../../common/builders/AlarmRunbookBuilder.js';
import { CloudWatchLogsQueryStep } from '../../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
import type { Runbook } from '../../../../../engine/types/Runbook.js';
import type { ApiGwPipelineAnchor } from '../types/ApiGwPipelineAnchor.js';
import { finishAlarmRunbook } from '../../../../common/builders/finishAlarmRunbook.js';

import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';

import { ParseApiGwErrorsStep } from '../../../../common/families/apigw/steps/ParseApiGwErrorsStep.js';
import { PrepareApiGwSectionStep } from '../../../../common/families/apigw/steps/PrepareApiGwSectionStep.js';
import { DescendToServiceStep } from '../tree/DescendToServiceStep.js';
import { ServiceLogsLevelReader } from '../tree/ServiceLogsLevelReader.js';
import { enumerateApiGwRequests } from '../tree/enumerateApiGwRequests.js';
import { enumerateServiceErrors } from '../tree/enumerateServiceErrors.js';
import { attributeServiceRow, serviceRowIdentity, traceIdOfFallbackRows } from '../tree/serviceLogRows.js';
import type { StepDescriptor } from '../../../../../engine/types/StepDescriptor.js';
import type { TreeLevel } from '../../../../../engine/types/TreeLevel.js';
import type { PipelineHook } from '../../../../../engine/types/PipelineHook.js';
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

  // 3. ExecutionLog of every request in error, read for the window and divided among the requests by request id.
  const executionLogStepId = 'query-api-gw-execution-logs';
  const executionLogEnabled =
    ctx.executionLogEnabled && profile.executionLog !== undefined && ctx.effectiveExecutionLogGroup !== undefined;
  if (executionLogEnabled && profile.executionLog !== undefined && ctx.effectiveExecutionLogGroup !== undefined) {
    builder.step(
      new QueryApiGwExecutionLogsStep({
        id: executionLogStepId,
        label: 'Query API Gateway ExecutionLog per requestId',
        fromStep: 'query-api-gw-logs',
        minStatusCode: minStatus,
        timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        spec: profile.executionLog,
        accessLogSchema: profile.accessLog.schema,
        queryProfileId: profile.id,
        executionLogGroup: ctx.effectiveExecutionLogGroup,
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
  }

  // 4. Root level: one node per request in error. Each request is parsed, checked against the authorizer and its
  // execution log, then descends to the entry service.
  const traceIdContextVar = profile.accessLog.schema.traceIdContextVar;
  const requestSteps: StepDescriptor[] = [
    {
      step: new ParseApiGwErrorsStep({
        id: 'parse-api-gw-errors',
        label: `Estrazione ${profile.accessLog.schema.traceIdLabel} e metadati API Gateway`,
        fromStep: 'query-api-gw-logs',
        minStatusCode: minStatus,
        schema: profile.accessLog.schema,
        queryProfileId: profile.id,
      }),
      silent: true,
    },
  ];
  if (config.authorizerFailureCheck !== undefined) {
    requestSteps.push({
      step: new EvaluateApiGwAuthorizerFailureStep({
        id: 'evaluate-api-gw-authorizer-failure',
        label: 'Valutazione Lambda authorizer API Gateway',
        fromStep: 'query-api-gw-logs',
        schema: profile.accessLog.schema,
        check: config.authorizerFailureCheck,
        queryProfileId: profile.id,
      }),
      silent: true,
    });
  }
  if (executionLogEnabled && executionLogAnalysisMode === 'terminal') {
    requestSteps.push({
      step: new StopApiGwExecutionLogAnalysisStep({
        id: 'stop-api-gw-execution-log-unresolved',
        label: 'Stop se execution log API Gateway non determinante',
      }),
      silent: true,
    });
  }
  requestSteps.push(...hooksAt(hooks, 'before-service-traversal', reachedAnchors));
  requestSteps.push({
    step: new DescendToServiceStep({
      id: 'descend-api-gateway',
      label: `Discesa verso ${config.entryService.name}`,
      entryService: config.entryService.name,
      servicesInRunbook,
      traceIdContextVar,
    }),
    silent: true,
  });

  // 5. One level per service: the errors of the service for each request, read for all of them at once.
  const serviceLevels = allServices.map((service): TreeLevel => {
    const readStepId = `query-${service.name}`;
    const entry = service.name === config.entryService.name;
    const nodeVars = new Set(['ErrorMsg', 'NextUrl', 'NextUrlTarget'].map((suffix) => `${service.varPrefix}${suffix}`));
    return {
      target: service.name,
      varPrefix: service.varPrefix,
      read: new ServiceLogsLevelReader({
        id: readStepId,
        label: `Query log ${service.name}`,
        serviceName: service.name,
        logGroups: [service.logGroup],
        spec: profile.serviceLog,
        queryProfileId: profile.id,
        timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        ...(service.queryOverride !== undefined ? { queryTemplateOverride: service.queryOverride } : {}),
      }),
      attribute: (row, identifier) => attributeServiceRow(row, identifier, profile.serviceLog.schema),
      rowIdentity: serviceRowIdentity,
      secondAttempt: (rows, identifier) => traceIdOfFallbackRows(rows, identifier, profile.serviceLog.schema),
      enumerate: enumerateServiceErrors({
        readStepId,
        varPrefix: service.varPrefix,
        schema: profile.serviceLog.schema,
        registry,
        traceIdContextVar,
      }),
      perNode: [
        ...(entry ? hooksAt(hooks, 'after-entry-analysis', reachedAnchors) : []),
        {
          step: new DescendToServiceStep({
            id: `descend-${service.name}`,
            label: `Discesa da ${service.name}`,
            service: { name: service.name, varPrefix: service.varPrefix },
            servicesInRunbook,
            traceIdContextVar,
          }),
          silent: true,
        },
      ],
      ...(service.exclusions !== undefined ? { exclusions: service.exclusions } : {}),
      ownsVar: (name) => nodeVars.has(name),
    };
  });

  builder.errorTree({
    root: {
      target: 'api-gateway',
      scopedSteps: ['query-api-gw-logs', ...(executionLogEnabled ? [executionLogStepId] : [])],
      enumerate: enumerateApiGwRequests({
        accessLogStepId: 'query-api-gw-logs',
        ...(executionLogEnabled ? { executionLogStepId } : {}),
        minStatusCode: minStatus,
        schema: profile.accessLog.schema,
      }),
      perNode: requestSteps,
      afterDescend: hooksAt(hooks, 'after-entry-read', reachedAnchors),
    },
    levels: serviceLevels,
  });

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

/**
 * The hooks declared at an anchor, as steps of a level; the anchor counts as reached.
 *
 * @param hooks - Hooks of the runbook
 * @param anchor - Anchor of the level
 * @param reached - Anchors reached so far
 * @returns The hooks at the anchor
 */
function hooksAt(
  hooks: ReadonlyArray<PipelineHook<ApiGwPipelineAnchor>>,
  anchor: ApiGwPipelineAnchor,
  reached: Set<ApiGwPipelineAnchor>,
): ReadonlyArray<StepDescriptor> {
  reached.add(anchor);
  return hooks.filter((hook) => hook.at === anchor);
}
