import { AlarmRunbookBuilder } from '../../../builders/AlarmRunbookBuilder.js';
import { CloudWatchLogsQueryStep } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
import type { Runbook } from '../../../../../engine/types/Runbook.js';
import type { ServiceAlarmConfig } from '../types/ServiceAlarmConfig.js';
import { PrepareServiceSectionStep } from '../steps/PrepareServiceSectionStep.js';
import { DescendToTraceStep } from '../tree/DescendToTraceStep.js';
import { ServiceTraceLevelReader, readsTraceBatches } from '../tree/ServiceTraceLevelReader.js';
import { applicationRowIdentity } from '../tree/applicationRowIdentity.js';
import { attributeTraceRow } from '../tree/attributeTraceRow.js';
import { enumerateServiceRootErrors } from '../tree/enumerateServiceRootErrors.js';
import { enumerateTraceErrors } from '../tree/enumerateTraceErrors.js';
import { defaultServiceUnknownCaseFallback } from './defaultServiceUnknownCaseFallback.js';
import { finishAlarmRunbook } from '../../../builders/finishAlarmRunbook.js';
import type { ServicePipelineAnchor } from '../types/ServicePipelineAnchor.js';

const TIME_RANGE = { start: 'startTime', end: 'endTime' } as const;

const TRACE_BATCH_SIZE = 50;

/**
 * Allowed characters for the service slug used to build step ids
 * (`query-<name>`, …), referenced by known cases. Flat (single quantifier) form;
 * leading/trailing hyphens are rejected separately to avoid a nested-quantifier
 * regex (the `security/detect-unsafe-regex` ReDoS heuristic).
 */
const SERVICE_NAME_PATTERN = /^[A-Za-z0-9-]+$/;

/** Identifier prefix used to build var names (`<varPrefix>TraceId`, …). */
const VAR_PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

export function createServiceAlarmRunbook(config: ServiceAlarmConfig): Runbook {
  validateConfig(config);

  const profile = config.queryProfile;
  const service = config.service;
  const errorQuery = service.queryOverride ?? profile.errorQuery;
  const traceQuery = service.traceQueryOverride ?? profile.traceQueryTemplate;

  const reachedAnchors = new Set<ServicePipelineAnchor>();
  const builder = AlarmRunbookBuilder.create(config.id)
    .metadata(config.metadata)
    .cloudExecutionPolicy({ sideEffects: 'NONE' });

  if (config.occurrenceTimeWindow !== undefined) {
    builder.occurrenceTimeWindow(config.occurrenceTimeWindow);
  }

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
      timeRangeFromParams: TIME_RANGE,
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
  for (const hook of (config.hooks ?? []).filter(({ at }) => at === 'after-service-scan'))
    builder.step(hook.step, hook);
  reachedAnchors.add('after-service-scan');
  reachedAnchors.add('after-service-analysis');
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
        ...(config.hooks ?? []).filter((hook) => hook.at === 'after-service-analysis'),
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
          timeRangeFromParams: TIME_RANGE,
        }),
        batchSize: readsTraceBatches(traceQuery) ? TRACE_BATCH_SIZE : 1,
        attribute: attributeTraceRow,
        rowIdentity: applicationRowIdentity,
        enumerate: enumerateTraceErrors(traceReadId, `${service.varPrefix}Trace`, profile.schema),
        ownsVar: (name) => name === traceErrorVar,
      },
    ],
  });

  return finishAlarmRunbook(builder, config, {
    builderName: 'createServiceAlarmRunbook',
    defaultFallback: () => defaultServiceUnknownCaseFallback(service),
    runbookContext: { kind: 'service', product: config.product, service, queryProfileId: profile.id },
    primaryResource: service.name,
    anchors: { hooks: config.hooks ?? [], reached: reachedAnchors, pipelineName: 'service' },
  });
}

function validateConfig(config: ServiceAlarmConfig): void {
  const service = config.service;
  if (config.id.trim() === '') {
    throw new Error('createServiceAlarmRunbook: id must be a non-empty string.');
  }
  if (service.name.trim() === '') {
    throw new Error(`createServiceAlarmRunbook "${config.id}": service.name must be a non-empty string.`);
  }
  if (service.logGroup.trim() === '') {
    throw new Error(`createServiceAlarmRunbook "${config.id}": service.logGroup must be a non-empty string.`);
  }
  if (service.varPrefix.trim() === '') {
    throw new Error(`createServiceAlarmRunbook "${config.id}": service.varPrefix must be a non-empty string.`);
  }
  if (!SERVICE_NAME_PATTERN.test(service.name) || service.name.startsWith('-') || service.name.endsWith('-')) {
    throw new Error(
      `createServiceAlarmRunbook "${config.id}": service.name "${service.name}" must be a slug ` +
        `(alphanumeric segments separated by "-", e.g. "pn-external-channel"); it is used to build step ids.`,
    );
  }
  if (!VAR_PREFIX_PATTERN.test(service.varPrefix)) {
    throw new Error(
      `createServiceAlarmRunbook "${config.id}": service.varPrefix "${service.varPrefix}" must start with a letter ` +
        `and contain only letters and digits (e.g. "externalChannel"); it is used to build var names.`,
    );
  }
}
