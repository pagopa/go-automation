import { interop, type Runbook } from '../framework.js';
import { M2M_EVENT_DISPATCHER_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: M2M_EVENT_DISPATCHER_ALARM.runbookKey,
    metadata: {
      name: M2M_EVENT_DISPATCHER_ALARM.runbookKey,
      description: 'Diagnosi degli errori Kafka del servizio interop-be-m2m-event-dispatcher in produzione',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'kafka', 'm2m'],
    },
    service: {
      name: M2M_EVENT_DISPATCHER_ALARM.podApp,
      logGroup: M2M_EVENT_DISPATCHER_ALARM.logGroup,
      varPrefix: M2M_EVENT_DISPATCHER_ALARM.varPrefix,
    },
    resolveAlarmContext: M2M_EVENT_DISPATCHER_ALARM.resolveContext,
    queryProfile: {
      ...interop.k8s.INTEROP_K8S_QUERY_PROFILE,
      id: 'interop-m2m-event-dispatcher-prod',
      applicationLogsQueryProfileId: 'interop-m2m-event-dispatcher-prod-errors',
      buildApplicationLogsQuery: (podApp) =>
        `filter pod_namespace = "prod"\n| ${interop.k8s.buildInteropK8sApplicationLogsQuery(podApp)}`,
    },
    knownCases: KNOWN_CASES,
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
