import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { M2M_EVENT_DISPATCHER_ALARM } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';

/**
 * Builds the k8s-interop-be-m2m-event-dispatcher-errors-prod runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: M2M_EVENT_DISPATCHER_ALARM,
    metadata: {
      name: M2M_EVENT_DISPATCHER_ALARM.runbookKey,
      description: 'Diagnosi degli errori Kafka del servizio interop-be-m2m-event-dispatcher in produzione',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'kafka', 'm2m'],
    },
    queryProfile: {
      ...interop.k8s.INTEROP_K8S_QUERY_PROFILE,
      id: 'interop-m2m-event-dispatcher-prod',
      applicationLogsQueryProfileId: 'interop-m2m-event-dispatcher-prod-errors',
      buildApplicationLogsQuery: (podApp) =>
        `filter pod_namespace = "prod"\n| ${interop.k8s.buildInteropK8sApplicationLogsQuery(podApp)}`,
    },
    knownErrors: KNOWN_ERRORS,
    analysisDefaults: {
      runbookName: M2M_EVENT_DISPATCHER_ALARM.runbookKey,
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2590736537/k8s-interop-be-m2m-event-dispatcher-errors-prod',
          name: M2M_EVENT_DISPATCHER_ALARM.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
