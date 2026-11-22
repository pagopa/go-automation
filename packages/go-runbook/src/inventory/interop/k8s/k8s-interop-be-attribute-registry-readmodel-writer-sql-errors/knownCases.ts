import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopErrorLine,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';

import { ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'attribute-registry-temporary-network-errors',
    description: 'Errore di connessione del readmodel writer SQL; temporaneità da verificare',
    // Entrambi i casi sono censiti solo in Prod; il tracker comprende anche altri servizi.
    environments: ['prod'],
    regex: interopErrorLine(INTEROP_KAFKA_SIGNATURES.connectionTimeout, INTEROP_KAFKA_SIGNATURES.tlsDisconnected),
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'Timeout o socket interrotto prima della connessione TLS; controparte, durata e recupero da verificare.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownCase(REFS, {
    id: 'attribute-registry-kafka-coordinator-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del readmodel writer SQL',
    environments: ['prod'],
    regex: INTEROP_KAFKA_SIGNATURES.unknownMemberRejoinWithReason,
    evidence: 'APPLICATION_LOGS',
    resolution: 'PIN-7325',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer tenta il rejoin perché il coordinator non lo riconosce; causa e recupero da verificare.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
  }),
];
