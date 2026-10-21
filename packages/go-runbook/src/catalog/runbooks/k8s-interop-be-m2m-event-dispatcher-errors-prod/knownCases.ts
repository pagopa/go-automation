import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';

import { interopKnownCase } from '../interop/interopKnownCases.js';
import { M2M_EVENT_DISPATCHER_ALARM } from './alarmDefinition.js';
const REFS = {
  applicationLogsStepId: M2M_EVENT_DISPATCHER_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: M2M_EVENT_DISPATCHER_ALARM.stepIds.queryCidTracker,
  varPrefix: M2M_EVENT_DISPATCHER_ALARM.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'm2m-consumer-crash',
    description: 'Crash del consumer Kafka dopo esaurimento dei tentativi',
    priority: 120,
    regex: 'Crash: KafkaJSNumberOfRetriesExceeded|Error Consumer crashed',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopKnownCase(REFS, {
    id: 'm2m-connection-refused',
    description: 'Connessione al broker Kafka rifiutata',
    priority: 110,
    regex: 'Connection error: connect ECONNREFUSED',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopKnownCase(REFS, {
    id: 'm2m-wrong-coordinator',
    description: 'Coordinator Kafka non corretto per il consumer group',
    priority: 100,
    regex: 'This is not the correct coordinator for this group',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopKnownCase(REFS, {
    id: 'm2m-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del consumer group',
    priority: 90,
    regex: 'The coordinator is not aware of this member',
    resolution: 'PIN-7325',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
  }),
  interopKnownCase(REFS, {
    id: 'm2m-connection-timeout-tls',
    description: 'Timeout di connessione o interruzione prima della negoziazione TLS',
    priority: 80,
    regex:
      'Connection timeout|Connection error: Client network socket disconnected before secure TLS connection was established',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
];
