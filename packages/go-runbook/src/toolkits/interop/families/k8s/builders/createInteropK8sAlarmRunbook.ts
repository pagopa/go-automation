import { omitUndefined } from '@pagopa/go-common/utils';

import { RunbookProducts } from '../../../../common/registration/RunbookProduct.js';
import { finishAlarmRunbook } from '../../../../common/builders/finishAlarmRunbook.js';
import { startAlarmRunbook } from '../../../../common/builders/startAlarmRunbook.js';
import { validateServiceIdentity } from '../../../../common/builders/validateServiceIdentity.js';
import { ALARM_TIME_RANGE } from '../../../../common/time/ALARM_TIME_RANGE.js';
import type { PipelineHook, Runbook } from '../../../../../engine/index.js';
import type { InteropK8sPipelineAnchor } from '../types/InteropK8sPipelineAnchor.js';
import type { InteropK8sAlarmConfig } from '../types/InteropK8sAlarmConfig.js';
import type { InteropK8sPodContext } from '../types/InteropK8sPodContext.js';
import type { InteropK8sRunbookStepIds } from '../types/InteropK8sRunbookStepIds.js';
import type { InteropK8sServiceDescriptor } from '../types/InteropK8sServiceDescriptor.js';
import { INTEROP_K8S_QUERY_PROFILE } from '../profiles/INTEROP_K8S_QUERY_PROFILE.js';
import { ResolveInteropK8sAlarmContextStep } from '../steps/ResolveInteropK8sAlarmContextStep.js';
import { QueryInteropPodContextStep } from '../steps/QueryInteropPodContextStep.js';
import { appendInteropCidPipeline } from '../../../applicationLogs/builders/appendInteropCidPipeline.js';
import { defaultInteropK8sUnknownCaseFallback } from './defaultInteropK8sUnknownCaseFallback.js';

/**
 * Assembles an INTEROP k8s alarm runbook: resolve the context of the alarm, read the application logs of its pod
 * app, then follow their CIDs into the tracker. The alarm declared with `defineInteropK8sAlarm` gives runbook key,
 * service and context resolution; the pod context, when declared, is read before the CID analysis.
 *
 * @param config - The alarm configuration
 * @returns A validated {@link Runbook} ready for the engine
 * @throws Error when the identity of the service is not valid
 *
 * @example
 * ```typescript
 * interop.k8s.createInteropK8sAlarmRunbook({ alarm: NOTIFIER_ALARM, metadata, knownCases: KNOWN_CASES });
 * ```
 */
export function createInteropK8sAlarmRunbook(config: InteropK8sAlarmConfig): Runbook {
  const { alarm } = config;
  const runbook = { ...config, id: alarm.runbookKey };
  const service: InteropK8sServiceDescriptor = {
    name: alarm.podApp,
    logGroup: alarm.logGroup,
    varPrefix: alarm.varPrefix,
  };
  validateServiceIdentity('createInteropK8sAlarmRunbook', runbook.id, service);

  const profile = config.queryProfile ?? INTEROP_K8S_QUERY_PROFILE;
  const timeRangeFromParams = config.timeRangeFromParams ?? ALARM_TIME_RANGE;
  const stepIds = { ...defaultInteropK8sRunbookStepIds(service.name), ...config.stepIds };
  const hooks = [...(config.hooks ?? []), ...podContextHooks(config.podContext)];
  const reachedAnchors = new Set<InteropK8sPipelineAnchor>();

  const builder = startAlarmRunbook(runbook);

  builder.step(
    new ResolveInteropK8sAlarmContextStep({
      id: stepIds.resolveContext,
      label: 'Risoluzione contesto allarme INTEROP k8s',
      resolveAlarmContext: alarm.resolveContext,
    }),
  );

  appendInteropCidPipeline(builder, {
    stepIds,
    applicationLabel: `log applicativi ${service.name}`,
    applicationTimeRange: timeRangeFromParams,
    applicationLogsQueryProfileId: profile.applicationLogsQueryProfileId,
    buildApplicationLogsQuery: profile.buildApplicationLogsQuery,
    varPrefix: service.varPrefix,
    cidTrackerTimeRange: timeRangeFromParams,
    cidTrackerQueryProfileId: profile.cidTrackerQueryProfileId,
    buildCidTrackerQuery: profile.buildCidTrackerQuery,
    hooks,
    reachedAnchors,
  });

  return finishAlarmRunbook(builder, runbook, {
    builderName: 'createInteropK8sAlarmRunbook',
    defaultFallback: () => defaultInteropK8sUnknownCaseFallback(service),
    runbookContext: {
      kind: 'service',
      product: RunbookProducts.INTEROP,
      service: { name: service.name, logGroup: service.logGroup, varPrefix: service.varPrefix },
      queryProfileId: profile.id,
    },
    primaryResource: config.primaryResource?.name ?? service.name,
    ...omitUndefined({ primaryResourceType: config.primaryResource?.type }),
    anchors: { hooks, reached: reachedAnchors, pipelineName: 'INTEROP k8s' },
  });
}

/**
 * Canonical step ids of an INTEROP k8s alarm runbook.
 *
 * @param serviceName - Pod app whose application logs the runbook reads
 * @returns The five pipeline step ids
 */
export function defaultInteropK8sRunbookStepIds(serviceName: string): InteropK8sRunbookStepIds {
  return {
    resolveContext: 'resolve-interop-alarm-context',
    queryApplicationLogs: `query-${serviceName}`,
    analyzeApplicationLogs: `analyze-${serviceName}`,
    queryCidTracker: 'query-interop-cid-tracker',
    analyzeCidTracker: 'analyze-interop-cid-tracker',
  };
}

/** The hook that reads the pod context before the CID analysis, with the evidence that keeps the whole episode. */
function podContextHooks(
  podContext: InteropK8sPodContext | undefined,
): ReadonlyArray<PipelineHook<InteropK8sPipelineAnchor>> {
  if (podContext === undefined) return [];
  return [
    {
      at: 'before-cid-analysis',
      step: new QueryInteropPodContextStep(podContext.step),
      evidence: [
        {
          id: podContext.evidenceId,
          label: podContext.evidenceLabel,
          type: 'log-sample',
          messageFields: ['log', '@message'],
          // The query rejects capped results: keep the whole episode, including its start.
          retention: { mode: 'all' },
        },
      ],
    },
  ];
}
