import { startAlarmRunbook } from '../../../builders/startAlarmRunbook.js';
import { validateServiceIdentity } from '../../../builders/validateServiceIdentity.js';
import { ALARM_TIME_RANGE } from '../../../time/ALARM_TIME_RANGE.js';
import { CloudWatchLogsQueryStep } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
import type { Runbook } from '../../../../../engine/index.js';
import { applyPipelineHooks, pipelineHooksAt } from '../../../../../engine/internal.js';
import type { ServiceAlarmConfig } from '../types/ServiceAlarmConfig.js';
import { PrepareServiceSectionStep } from '../steps/PrepareServiceSectionStep.js';
import { DescendToTraceStep } from '../tree/DescendToTraceStep.js';
import { ServiceTraceLevelReader, readsTraceBatches } from '../tree/ServiceTraceLevelReader.js';
import { applicationRowIdentity } from '../tree/applicationRowIdentity.js';
import { attributeTraceRow } from '../tree/attributeTraceRow.js';
import { enumerateServiceRootErrors } from '../tree/enumerateServiceRootErrors.js';
import { enumerateTraceErrors } from '../tree/enumerateTraceErrors.js';
import { defaultServiceUnknownErrorFallback } from './defaultServiceUnknownErrorFallback.js';
import { finishAlarmRunbook } from '../../../builders/finishAlarmRunbook.js';
import type { ServicePipelineAnchor } from '../types/ServicePipelineAnchor.js';

/**
 * Builds the runbook of a service alarm: the error scan of the service, then an error tree that reads each error by
 * trace id, with the hooks of the pipeline and the known errors of the configuration.
 *
 * @param config - Configuration of the service alarm
 * @returns The runbook
 * @throws Error when the service identity, the hooks or the known errors are invalid
 */
export function createServiceAlarmRunbook(config: ServiceAlarmConfig): Runbook {
  validateServiceIdentity('createServiceAlarmRunbook', config.id, config.service);

  const profile = config.queryProfile;
  const service = config.service;
  const errorQuery = service.queryOverride ?? profile.errorQuery;
  const traceQuery = service.traceQueryOverride ?? profile.traceQueryTemplate;

  const reachedAnchors = new Set<ServicePipelineAnchor>();
  const builder = startAlarmRunbook(config);

  builder.step(
    new PrepareServiceSectionStep({
      id: 'prepare-service-section',
      label: 'Preparazione servizio',
      serviceName: service.name,
      logGroup: service.logGroup,
    }),
    { silent: true },
  );

  builder.step(
    new CloudWatchLogsQueryStep({
      id: `query-${service.name}`,
      label: `Query log ${service.name} per errori`,
      logGroups: [service.logGroup],
      query: errorQuery,
      timeRangeFromParams: ALARM_TIME_RANGE,
      logGroupResolutionMode: 'search-configured-profiles',
      traceMetadata: {
        queryProfileId: profile.id,
        queryKind: 'service-error-scan',
        identifierMode: 'none',
      },
    }),
    { silent: true },
  );

  // Window steps over every error of the scan, then the steps of each error.
  applyPipelineHooks(builder, config.hooks ?? [], 'after-service-scan', reachedAnchors);
  const traceTarget = `${service.name}-trace`;
  const traceReadId = `query-${service.name}-trace`;
  const traceErrorVar = `${service.varPrefix}TraceErrorMsg`;
  builder.errorTree({
    root: {
      target: service.name,
      scopedSteps: [`query-${service.name}`],
      rowIdentity: applicationRowIdentity,
      enumerate: enumerateServiceRootErrors({
        stepId: `query-${service.name}`,
        varPrefix: service.varPrefix,
        schema: profile.schema,
        ...(profile.extractFallbackUuid !== undefined ? { extractFallbackUuid: profile.extractFallbackUuid } : {}),
      }),
      perNode: [
        ...pipelineHooksAt(config.hooks ?? [], 'after-service-analysis', reachedAnchors),
        {
          step: new DescendToTraceStep(`descend-${service.name}`, traceTarget, `${service.varPrefix}TraceId`),
          silent: true,
        },
      ],
    },
    levels: [
      {
        target: traceTarget,
        varPrefix: `${service.varPrefix}Trace`,
        read: new ServiceTraceLevelReader({
          id: traceReadId,
          label: `Query log ${service.name} per trace_id`,
          serviceName: service.name,
          logGroups: [service.logGroup],
          queryTemplate: traceQuery,
          queryProfileId: profile.id,
          timeRangeFromParams: ALARM_TIME_RANGE,
        }),
        // A query that names one trace reads one at a time; a batch query takes as many as fit.
        ...(readsTraceBatches(traceQuery) ? {} : { batchSize: 1 }),
        attribute: attributeTraceRow,
        rowIdentity: applicationRowIdentity,
        enumerate: enumerateTraceErrors(traceReadId, `${service.varPrefix}Trace`, profile.schema),
        ownsVar: (name) => name === traceErrorVar,
      },
    ],
  });

  return finishAlarmRunbook(builder, config, {
    builderName: 'createServiceAlarmRunbook',
    defaultFallback: () => defaultServiceUnknownErrorFallback(service),
    runbookContext: { kind: 'service', product: config.product, service, queryProfileId: profile.id },
    primaryResource: service.name,
    anchors: { hooks: config.hooks ?? [], reached: reachedAnchors, pipelineName: 'service' },
  });
}
