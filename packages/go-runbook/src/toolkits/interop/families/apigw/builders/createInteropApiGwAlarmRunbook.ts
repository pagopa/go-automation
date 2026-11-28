import { RunbookProducts } from '../../../../common/registration/RunbookProduct.js';
import { finishAlarmRunbook } from '../../../../common/builders/finishAlarmRunbook.js';
import { startAlarmRunbook } from '../../../../common/builders/startAlarmRunbook.js';
import { ALARM_TIME_RANGE } from '../../../../common/time/ALARM_TIME_RANGE.js';
import type { Runbook } from '../../../../../engine/index.js';

import { appendInteropCidPipeline } from '../../../applicationLogs/builders/appendInteropCidPipeline.js';
import { buildInteropK8sCidTrackerQuery } from '../../../applicationLogs/queries/interopK8sQueries.js';
import { INTEROP_CID_TRACKER_QUERY_PROFILE_ID } from '../../../applicationLogs/queries/interopApplicationLogsQueryProfileIds.js';

import { AnalyzeInteropApiGwAggregatesStep } from '../steps/AnalyzeInteropApiGwAggregatesStep.js';
import { QueryInteropApiGwAggregatesStep } from '../steps/QueryInteropApiGwAggregatesStep.js';
import { ResolveInteropApiGwAlarmContextStep } from '../steps/ResolveInteropApiGwAlarmContextStep.js';
import type { InteropApiGwAlarmConfig } from '../types/InteropApiGwAlarmConfig.js';
import type { InteropApiGwRunbookStepIds } from '../types/InteropApiGwRunbookStepIds.js';
import type { InteropApiGwPipelineAnchor } from '../types/InteropApiGwPipelineAnchor.js';
import { defaultInteropApiGwUnknownErrorFallback } from './defaultInteropApiGwUnknownErrorFallback.js';

/**
 * Canonical step ids of an INTEROP API Gateway alarm runbook.
 *
 * The application-log ids carry the service name so a known error reads
 * which service it is asserting on, exactly like the k8s family.
 *
 * @param serviceName - Pod app whose application logs the runbook reads
 * @returns The seven pipeline step ids
 */
export function defaultInteropApiGwRunbookStepIds(serviceName: string): InteropApiGwRunbookStepIds {
  return {
    resolveContext: 'resolve-interop-api-gw-context',
    queryApiGwAggregates: 'query-api-gw-logs',
    analyzeApiGwAggregates: 'analyze-api-gw-logs',
    queryApplicationLogs: `query-${serviceName}`,
    analyzeApplicationLogs: `analyze-${serviceName}`,
    queryCidTracker: 'query-interop-cid-tracker',
    analyzeCidTracker: 'analyze-interop-cid-tracker',
  };
}

/**
 * Assembles an INTEROP API Gateway alarm runbook.
 *
 * The pipeline is fixed — resolve the context, aggregate the access log,
 * read the service's application logs, then follow the CIDs into the
 * tracker — so a runbook declares only the queries and the identifiers
 * that make it different from its siblings; the alarm declared with
 * `defineInteropApiGwAlarm` gives runbook key, service, log groups and
 * context resolution. Mirrors `interop.k8s.createInteropK8sAlarmRunbook`.
 *
 * @param config - The alarm configuration
 * @returns A validated {@link Runbook} ready for the engine
 */
export function createInteropApiGwAlarmRunbook(config: InteropApiGwAlarmConfig): Runbook {
  const { alarm, queryProfile } = config;
  const application = config.application ?? {};
  const runbook = { ...config, id: alarm.runbookKey };
  const stepIds = { ...defaultInteropApiGwRunbookStepIds(alarm.serviceName), ...config.stepIds };
  const reachedAnchors = new Set<InteropApiGwPipelineAnchor>();
  const timeRange = config.timeRangeFromParams ?? ALARM_TIME_RANGE;
  const podAppFilter = alarm.podAppFilter;
  const buildApplicationLogsQuery =
    podAppFilter === undefined
      ? queryProfile.buildApplicationLogsQuery
      : (): string => queryProfile.buildApplicationLogsQuery(podAppFilter);

  const builder = startAlarmRunbook(runbook);

  builder.step(
    new ResolveInteropApiGwAlarmContextStep({
      id: stepIds.resolveContext,
      label: 'Risoluzione contesto API Gateway INTEROP',
      resolverId: config.resolverId,
      resolveAlarmContext: alarm.resolveContext,
    }),
  );

  builder.step(
    new QueryInteropApiGwAggregatesStep({
      id: stepIds.queryApiGwAggregates,
      label: `Query aggregata access log ${queryProfile.errorFamilyLabel} API Gateway INTEROP`,
      timeRangeFromParams: timeRange,
      queryProfileId: queryProfile.apiGwQueryProfileId,
      queryKind: queryProfile.apiGwQueryKind,
      errorFamilyLabel: queryProfile.errorFamilyLabel,
      buildQuery: queryProfile.buildApiGwAggregateQuery,
    }),
  );

  builder.step(
    new AnalyzeInteropApiGwAggregatesStep({
      id: stepIds.analyzeApiGwAggregates,
      label: `Analisi aggregati ${queryProfile.errorFamilyLabel} API Gateway INTEROP`,
      fromStep: stepIds.queryApiGwAggregates,
      errorFamilyLabel: queryProfile.errorFamilyLabel,
    }),
  );

  appendInteropCidPipeline(builder, {
    stepIds,
    applicationLabel: application.label ?? `log applicativi ${alarm.serviceName}`,
    applicationTimeRange: application.timeRangeFromParams ?? timeRange,
    applicationLogsQueryProfileId: queryProfile.applicationLogsQueryProfileId,
    buildApplicationLogsQuery,
    varPrefix: alarm.varPrefix,
    ...(application.countField !== undefined ? { countField: application.countField } : {}),
    cidTrackerTimeRange: timeRange,
    cidTrackerQueryProfileId: INTEROP_CID_TRACKER_QUERY_PROFILE_ID,
    buildCidTrackerQuery: buildInteropK8sCidTrackerQuery,
    hooks: config.hooks ?? [],
    reachedAnchors,
  });

  return finishAlarmRunbook(builder, runbook, {
    builderName: 'createInteropApiGwAlarmRunbook',
    defaultFallback: () => defaultInteropApiGwUnknownErrorFallback(config),
    runbookContext: {
      kind: 'apigw',
      product: RunbookProducts.INTEROP,
      apiGwLogGroup: alarm.apiGwLogGroupTemplate,
      queryProfileId: alarm.apiGwProfileId,
      services: [
        {
          name: alarm.serviceName,
          logGroup: alarm.applicationLogGroupTemplate,
          varPrefix: alarm.varPrefix,
        },
      ],
    },
    primaryResource: alarm.serviceName,
    defaultRunbookName: alarm.runbookKey,
    anchors: { hooks: config.hooks ?? [], reached: reachedAnchors, pipelineName: 'INTEROP API Gateway' },
  });
}
