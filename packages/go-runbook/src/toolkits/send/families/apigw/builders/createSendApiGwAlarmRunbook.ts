import { startAlarmRunbook } from '../../../../common/builders/startAlarmRunbook.js';
import { ALARM_TIME_RANGE } from '../../../../common/time/ALARM_TIME_RANGE.js';
import { CloudWatchLogsQueryStep } from '../../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
import type { Runbook, StepDescriptor, TreeLevel } from '../../../../../engine/index.js';
import { pipelineHooksAt } from '../../../../../engine/internal.js';
import type { ApiGwPipelineAnchor } from '../types/ApiGwPipelineAnchor.js';
import { finishAlarmRunbook } from '../../../../common/builders/finishAlarmRunbook.js';

import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';

import { ParseApiGwErrorsStep } from '../../../../common/families/apigw/steps/ParseApiGwErrorsStep.js';
import { PrepareApiGwSectionStep } from '../../../../common/families/apigw/steps/PrepareApiGwSectionStep.js';
import { DescendToServiceStep } from '../tree/DescendToServiceStep.js';
import { ServiceLogsLevelReader } from '../tree/ServiceLogsLevelReader.js';
import { enumerateApiGwRequests } from '../tree/enumerateApiGwRequests.js';
import { enumerateServiceErrors } from '../tree/enumerateServiceErrors.js';
import { serviceRowMatcher, traceIdOfFallbackRows } from '../tree/serviceLogRows.js';
import { logRowIdentity } from '../../../../common/steps/aws/cloudwatch-logs/logRowIdentity.js';
import { QueryApiGwExecutionLogsStep } from '../../../../common/families/apigw/steps/QueryApiGwExecutionLogsStep.js';
import { StopApiGwExecutionLogAnalysisStep } from '../../../../common/families/apigw/steps/StopApiGwExecutionLogAnalysisStep.js';
import { EvaluateApiGwAuthorizerFailureStep } from '../../../../common/families/apigw/steps/EvaluateApiGwAuthorizerFailureStep.js';
import { builtinApiGwAuthorizerKnownErrors } from '../../../../common/families/apigw/knownErrors/authorizerKnownErrors.js';
import { defaultSendApiGwUnknownErrorFallback } from './defaultSendApiGwUnknownErrorFallback.js';
import { resolveApiGwAlarmBuildContext } from './resolveApiGwAlarmBuildContext.js';
import { SEND_API_GW_STEP_IDS as STEP_IDS } from './SEND_API_GW_STEP_IDS.js';

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

  const builder = startAlarmRunbook(config);

  // 1. Banner.
  builder.step(
    new PrepareApiGwSectionStep({
      id: STEP_IDS.prepare,
      label: 'Preparazione API Gateway',
      apiGwLogGroup: config.apiGwLogGroup,
    }),
    { silent: true },
  );

  // 2. AccessLog query (con traceMetadata cross-prodotto).
  builder.step(
    new CloudWatchLogsQueryStep({
      id: STEP_IDS.accessLog,
      label: 'Query API Gateway AccessLog per errori HTTP',
      logGroups: [config.apiGwLogGroup],
      query: apiGwQuery,
      ...(ctx.apiGwFallbackQuery !== undefined ? { emptyResultFallbackQuery: ctx.apiGwFallbackQuery } : {}),
      timeRangeFromParams: ALARM_TIME_RANGE,
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
  const executionLogStepId = STEP_IDS.executionLog;
  const executionLogEnabled =
    ctx.executionLogEnabled && profile.executionLog !== undefined && ctx.effectiveExecutionLogGroup !== undefined;
  if (executionLogEnabled && profile.executionLog !== undefined && ctx.effectiveExecutionLogGroup !== undefined) {
    builder.step(
      new QueryApiGwExecutionLogsStep({
        id: executionLogStepId,
        label: 'Query API Gateway ExecutionLog per requestId',
        fromStep: STEP_IDS.accessLog,
        minStatusCode: minStatus,
        timeRangeFromParams: ALARM_TIME_RANGE,
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
        id: STEP_IDS.parse,
        label: `Estrazione ${profile.accessLog.schema.traceIdLabel} e metadati API Gateway`,
        fromStep: STEP_IDS.accessLog,
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
        id: STEP_IDS.authorizerFailure,
        label: 'Valutazione Lambda authorizer API Gateway',
        fromStep: STEP_IDS.accessLog,
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
        id: STEP_IDS.stopExecutionLog,
        label: 'Stop se execution log API Gateway non determinante',
      }),
      silent: true,
    });
  }
  requestSteps.push(...pipelineHooksAt(hooks, 'before-service-traversal', reachedAnchors));
  requestSteps.push({
    step: new DescendToServiceStep({
      id: STEP_IDS.descend,
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
        timeRangeFromParams: ALARM_TIME_RANGE,
        ...(service.queryOverride !== undefined ? { queryTemplateOverride: service.queryOverride } : {}),
      }),
      attribute: (identifier) => serviceRowMatcher([identifier], profile.serviceLog.schema),
      rowIdentity: logRowIdentity,
      secondAttempt: (rows, identifier) => traceIdOfFallbackRows(rows, identifier, profile.serviceLog.schema),
      enumerate: enumerateServiceErrors({
        readStepId,
        varPrefix: service.varPrefix,
        schema: profile.serviceLog.schema,
        registry,
        traceIdContextVar,
        ...(service.mergeIdenticalErrors === true ? { mergeIdenticalErrors: true } : {}),
      }),
      perNode: [
        ...(entry ? pipelineHooksAt(hooks, 'after-entry-analysis', reachedAnchors) : []),
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
      scopedSteps: [STEP_IDS.accessLog, ...(executionLogEnabled ? [executionLogStepId] : [])],
      enumerate: enumerateApiGwRequests({
        accessLogStepId: STEP_IDS.accessLog,
        ...(executionLogEnabled ? { executionLogStepId } : {}),
        minStatusCode: minStatus,
        schema: profile.accessLog.schema,
      }),
      perNode: requestSteps,
      afterDescend: pipelineHooksAt(hooks, 'after-entry-read', reachedAnchors),
    },
    levels: serviceLevels,
  });

  // 8. Known errors.
  for (const knownError of builtinApiGwAuthorizerKnownErrors(config.authorizerFailureCheck)) {
    builder.knownError(knownError);
  }
  // 9. Known errors, fallback, context, analysis defaults, iteration cap, build.
  return finishAlarmRunbook(builder, config, {
    builderName: 'createSendApiGwAlarmRunbook',
    defaultFallback: () =>
      defaultSendApiGwUnknownErrorFallback(
        allServices,
        profile.accessLog.schema.traceIdContextVar,
        profile.accessLog.schema.traceIdLabel,
      ),
    runbookContext: { ...ctx.runbookContext },
    primaryResource: config.entryService.name,
    anchors: { hooks, reached: reachedAnchors, pipelineName: 'API Gateway' },
  });
}
