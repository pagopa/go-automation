import { RunbookBuilder } from '../../../builders/RunbookBuilder.js';
import { finishAlarmRunbook } from '../../../builders/finishAlarmRunbook.js';
import type { Runbook } from '../../../types/Runbook.js';
import type { TimeRangeFromParams } from '../../../steps/data/TimeRangeFromParams.js';

import { AnalyzeInteropK8sApplicationLogsStep } from '../../k8s/steps/AnalyzeInteropK8sApplicationLogsStep.js';
import { AnalyzeInteropK8sCidTrackerStep } from '../../k8s/steps/AnalyzeInteropK8sCidTrackerStep.js';
import { QueryInteropK8sApplicationLogsStep } from '../../k8s/steps/QueryInteropK8sApplicationLogsStep.js';
import { QueryInteropK8sCidTrackerStep } from '../../k8s/steps/QueryInteropK8sCidTrackerStep.js';

import { AnalyzeInteropApiGwAggregatesStep } from '../steps/AnalyzeInteropApiGwAggregatesStep.js';
import { QueryInteropApiGwAggregatesStep } from '../steps/QueryInteropApiGwAggregatesStep.js';
import { ResolveInteropApiGwAlarmContextStep } from '../steps/ResolveInteropApiGwAlarmContextStep.js';
import type { InteropApiGwAlarmConfig } from '../types/InteropApiGwAlarmConfig.js';
import type { InteropApiGwRunbookStepIds } from '../types/InteropApiGwRunbookStepIds.js';
import { defaultInteropApiGwUnknownCaseFallback } from './defaultInteropApiGwUnknownCaseFallback.js';

const DEFAULT_TIME_RANGE: TimeRangeFromParams = { start: 'startTime', end: 'endTime' };

/**
 * Canonical step ids of an INTEROP API Gateway alarm runbook.
 *
 * The application-log ids carry the service name so a known case reads
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
 * that make it different from its siblings. Mirrors
 * `interop.k8s.createInteropK8sAlarmRunbook`.
 *
 * @param config - The alarm configuration
 * @returns A validated {@link Runbook} ready for the engine
 */
export function createInteropApiGwAlarmRunbook(config: InteropApiGwAlarmConfig): Runbook {
  const { apiGw, application, queryProfile } = config;
  const stepIds = { ...defaultInteropApiGwRunbookStepIds(application.serviceName), ...config.stepIds };
  const timeRange = config.timeRangeFromParams ?? DEFAULT_TIME_RANGE;
  const applicationTimeRange = application.timeRangeFromParams ?? timeRange;
  const applicationLabel = application.label ?? `log applicativi ${application.serviceName}`;
  const podAppFilter = application.podAppFilter;
  const buildApplicationLogsQuery =
    podAppFilter === undefined
      ? queryProfile.buildApplicationLogsQuery
      : (): string => queryProfile.buildApplicationLogsQuery(podAppFilter);

  const builder = RunbookBuilder.create(config.id)
    .metadata(config.metadata)
    .cloudExecutionPolicy({ sideEffects: 'NONE' });

  if (config.occurrenceTimeWindow !== undefined) {
    builder.occurrenceTimeWindow(config.occurrenceTimeWindow);
  }

  builder.step(
    new ResolveInteropApiGwAlarmContextStep({
      id: stepIds.resolveContext,
      label: 'Risoluzione contesto API Gateway INTEROP',
      resolverId: config.resolverId,
      resolveAlarmContext: config.resolveAlarmContext,
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

  builder.step(
    new QueryInteropK8sApplicationLogsStep({
      id: stepIds.queryApplicationLogs,
      label: `Query ${applicationLabel}`,
      timeRangeFromParams: applicationTimeRange,
      queryProfileId: queryProfile.applicationLogsQueryProfileId,
      buildQuery: buildApplicationLogsQuery,
    }),
  );

  builder.step(
    new AnalyzeInteropK8sApplicationLogsStep({
      id: stepIds.analyzeApplicationLogs,
      label: `Analisi ${applicationLabel}`,
      fromStep: stepIds.queryApplicationLogs,
      varPrefix: application.varPrefix,
      ...(application.countField !== undefined ? { countField: application.countField } : {}),
    }),
  );

  builder.step(
    new QueryInteropK8sCidTrackerStep({
      id: stepIds.queryCidTracker,
      label: 'Query CID tracker INTEROP',
      fromStep: stepIds.analyzeApplicationLogs,
      timeRangeFromParams: timeRange,
    }),
  );

  builder.step(
    new AnalyzeInteropK8sCidTrackerStep({
      id: stepIds.analyzeCidTracker,
      label: 'Analisi CID tracker INTEROP',
      fromStep: stepIds.queryCidTracker,
    }),
  );

  return finishAlarmRunbook(builder, config, {
    defaultFallback: () => defaultInteropApiGwUnknownCaseFallback(config),
    runbookContext: {
      kind: 'apigw',
      apiGwLogGroup: apiGw.logGroupTemplate,
      queryProfileId: apiGw.profileId,
      services: [
        {
          name: application.serviceName,
          logGroup: application.logGroupTemplate,
          varPrefix: application.varPrefix,
        },
      ],
    },
    primaryResource: application.serviceName,
    defaultRunbookName: config.id,
  });
}
