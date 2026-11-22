import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';

import { M2M_EVENT_DISPATCHER_ALARM } from './alarmDefinition.js';
const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: M2M_EVENT_DISPATCHER_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: M2M_EVENT_DISPATCHER_ALARM.stepIds.queryCidTracker,
  varPrefix: M2M_EVENT_DISPATCHER_ALARM.varPrefix,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'm2m-consumer-crash',
    description: 'Crash del consumer Kafka dopo esaurimento dei tentativi',
    regex: 'Crash: KafkaJSNumberOfRetriesExceeded|Error Consumer crashed',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownCase(REFS, {
    id: 'm2m-connection-refused',
    description: 'Connessione al broker Kafka rifiutata',
    regex: INTEROP_KAFKA_SIGNATURES.connectionRefused,
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownCase(REFS, {
    id: 'm2m-wrong-coordinator',
    description: 'Coordinator Kafka non corretto per il consumer group',
    regex: INTEROP_KAFKA_SIGNATURES.wrongCoordinator,
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownCase(REFS, {
    id: 'm2m-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del consumer group',
    regex: INTEROP_KAFKA_SIGNATURES.unknownMember,
    evidence: 'APPLICATION_LOGS',
    resolution: 'PIN-7325',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
  }),
  interopK8sKnownCase(REFS, {
    id: 'm2m-connection-timeout-tls',
    description: 'Timeout di connessione o interruzione prima della negoziazione TLS',
    regex: `(?:${INTEROP_KAFKA_SIGNATURES.connectionTimeout}|${INTEROP_KAFKA_SIGNATURES.tlsDisconnected})`,
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
];
