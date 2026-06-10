import { RunbookBuilder } from '../../builders/RunbookBuilder.js';
import { CloudWatchLogsQueryStep } from '../../steps/data/CloudWatchLogsQueryStep.js';
import type { Runbook } from '../../types/Runbook.js';
import type { ServiceAlarmConfig } from '../types/ServiceAlarmConfig.js';
import { SEND_SERVICE_PROFILE } from '../profiles/SEND_SERVICE_PROFILE.js';
import { PrepareServiceSectionStep } from '../steps/prepareServiceSection.js';
import { AnalyzeServiceLogsStep } from '../steps/analyzeServiceLogs.js';
import { QueryServiceTraceLogsStep } from '../steps/queryServiceTraceLogs.js';
import { defaultServiceUnknownCaseFallback } from './defaultUnknownCaseFallback.js';

const TIME_RANGE = { start: 'startTime', end: 'endTime' } as const;

export function createServiceAlarmRunbook(config: ServiceAlarmConfig): Runbook {
  validateConfig(config);

  const profile = config.queryProfile ?? SEND_SERVICE_PROFILE;
  const service = config.service;
  const errorQuery = service.queryOverride ?? profile.errorQuery;
  const traceQuery = service.traceQueryOverride ?? profile.traceQueryTemplate;

  const builder = RunbookBuilder.create(config.id).metadata(config.metadata);

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

  builder.step(
    new AnalyzeServiceLogsStep({
      id: `analyze-${service.name}`,
      label: `Analisi log ${service.name}`,
      fromStep: `query-${service.name}`,
      serviceName: service.name,
      varPrefix: service.varPrefix,
      schema: profile.schema,
    }),
    { silent: true },
  );

  for (const descriptor of config.preSteps ?? []) {
    const opts: { continueOnFailure?: boolean; silent?: boolean } = {};
    if (descriptor.continueOnFailure === true) opts.continueOnFailure = true;
    if (descriptor.silent === true) opts.silent = true;
    builder.step(descriptor.step, opts);
  }

  builder.step(
    new QueryServiceTraceLogsStep({
      id: `query-${service.name}-trace`,
      label: `Query log ${service.name} per trace_id`,
      serviceName: service.name,
      varPrefix: service.varPrefix,
      logGroups: [service.logGroup],
      queryTemplate: traceQuery,
      queryProfileId: profile.id,
      timeRangeFromParams: TIME_RANGE,
    }),
    { silent: true },
  );

  for (const knownCase of config.knownCases) {
    builder.knownCase(knownCase);
  }

  builder.fallback(config.fallbackAction ?? defaultServiceUnknownCaseFallback(service));
  builder.runbookContext({
    kind: 'service',
    service,
    queryProfileId: profile.id,
  });

  if (config.maxIterations !== undefined) {
    builder.maxIterations(config.maxIterations);
  }

  return builder.build();
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
}
