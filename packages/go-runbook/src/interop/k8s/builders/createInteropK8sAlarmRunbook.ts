import { RunbookBuilder } from '../../../builders/RunbookBuilder.js';
import { finishAlarmRunbook } from '../../../builders/finishAlarmRunbook.js';
import type { Runbook } from '../../../types/Runbook.js';
import type { InteropK8sAlarmConfig } from '../types/InteropK8sAlarmConfig.js';
import type { InteropK8sRunbookStepIds } from '../types/InteropK8sRunbookStepIds.js';
import { INTEROP_K8S_QUERY_PROFILE } from '../profiles/INTEROP_K8S_QUERY_PROFILE.js';
import { ResolveInteropK8sAlarmContextStep } from '../steps/ResolveInteropK8sAlarmContextStep.js';
import { QueryInteropK8sApplicationLogsStep } from '../steps/QueryInteropK8sApplicationLogsStep.js';
import { AnalyzeInteropK8sApplicationLogsStep } from '../steps/AnalyzeInteropK8sApplicationLogsStep.js';
import { QueryInteropK8sCidTrackerStep } from '../steps/QueryInteropK8sCidTrackerStep.js';
import { AnalyzeInteropK8sCidTrackerStep } from '../steps/AnalyzeInteropK8sCidTrackerStep.js';
import { defaultInteropK8sUnknownCaseFallback } from './defaultInteropK8sUnknownCaseFallback.js';

const DEFAULT_TIME_RANGE = { start: 'startTime', end: 'endTime' } as const;
const SERVICE_NAME_PATTERN = /^[A-Za-z0-9-]+$/;
const VAR_PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

export function createInteropK8sAlarmRunbook(config: InteropK8sAlarmConfig): Runbook {
  validateConfig(config);

  const service = config.service;
  const profile = config.queryProfile ?? INTEROP_K8S_QUERY_PROFILE;
  const timeRangeFromParams = config.timeRangeFromParams ?? DEFAULT_TIME_RANGE;
  const stepIds = resolveInteropK8sRunbookStepIds(service.name, config.stepIds);

  const builder = RunbookBuilder.create(config.id)
    .metadata(config.metadata)
    .cloudExecutionPolicy({ sideEffects: 'NONE' });

  if (config.occurrenceTimeWindow !== undefined) {
    builder.occurrenceTimeWindow(config.occurrenceTimeWindow);
  }

  builder.step(
    new ResolveInteropK8sAlarmContextStep({
      id: stepIds.resolveContext,
      label: 'Risoluzione contesto allarme INTEROP k8s',
      resolveAlarmContext: config.resolveAlarmContext,
    }),
  );

  builder.step(
    new QueryInteropK8sApplicationLogsStep({
      id: stepIds.queryApplicationLogs,
      label: `Query log applicativi ${service.name}`,
      timeRangeFromParams,
      queryProfileId: profile.applicationLogsQueryProfileId,
      buildQuery: profile.buildApplicationLogsQuery,
    }),
  );

  builder.step(
    new AnalyzeInteropK8sApplicationLogsStep({
      id: stepIds.analyzeApplicationLogs,
      label: `Analisi log applicativi ${service.name}`,
      fromStep: stepIds.queryApplicationLogs,
      varPrefix: service.varPrefix,
    }),
  );

  builder.step(
    new QueryInteropK8sCidTrackerStep({
      id: stepIds.queryCidTracker,
      label: 'Query CID tracker INTEROP',
      fromStep: stepIds.analyzeApplicationLogs,
      timeRangeFromParams,
      queryProfileId: profile.cidTrackerQueryProfileId,
      buildQuery: profile.buildCidTrackerQuery,
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
    builderName: 'createInteropK8sAlarmRunbook',
    defaultFallback: () => defaultInteropK8sUnknownCaseFallback(service),
    runbookContext: {
      kind: 'service',
      service: { name: service.name, logGroup: service.logGroup, varPrefix: service.varPrefix },
      queryProfileId: profile.id,
    },
    primaryResource: service.name,
  });
}

export function defaultInteropK8sRunbookStepIds(serviceName: string): InteropK8sRunbookStepIds {
  return {
    resolveContext: 'resolve-interop-alarm-context',
    queryApplicationLogs: `query-${serviceName}`,
    analyzeApplicationLogs: `analyze-${serviceName}`,
    queryCidTracker: 'query-interop-cid-tracker',
    analyzeCidTracker: 'analyze-interop-cid-tracker',
  };
}

function resolveInteropK8sRunbookStepIds(
  serviceName: string,
  overrides: Partial<InteropK8sRunbookStepIds> | undefined,
): InteropK8sRunbookStepIds {
  return { ...defaultInteropK8sRunbookStepIds(serviceName), ...overrides };
}

function validateConfig(config: InteropK8sAlarmConfig): void {
  const service = config.service;
  if (config.id.trim() === '') {
    throw new Error('createInteropK8sAlarmRunbook: id must be a non-empty string.');
  }
  if (service.name.trim() === '') {
    throw new Error(`createInteropK8sAlarmRunbook "${config.id}": service.name must be a non-empty string.`);
  }
  if (service.logGroup.trim() === '') {
    throw new Error(`createInteropK8sAlarmRunbook "${config.id}": service.logGroup must be a non-empty string.`);
  }
  if (service.varPrefix.trim() === '') {
    throw new Error(`createInteropK8sAlarmRunbook "${config.id}": service.varPrefix must be a non-empty string.`);
  }
  if (!SERVICE_NAME_PATTERN.test(service.name) || service.name.startsWith('-') || service.name.endsWith('-')) {
    throw new Error(
      `createInteropK8sAlarmRunbook "${config.id}": service.name "${service.name}" must be a slug ` +
        '(alphanumeric segments separated by "-", e.g. "interop-be-backend-for-frontend").',
    );
  }
  if (!VAR_PREFIX_PATTERN.test(service.varPrefix)) {
    throw new Error(
      `createInteropK8sAlarmRunbook "${config.id}": service.varPrefix "${service.varPrefix}" must start with a letter ` +
        'and contain only letters and digits (e.g. "interopBff").',
    );
  }
}
