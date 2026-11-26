import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopErrorLine,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';

import { TENANT_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'tenant-readmodel-writer-sql-kafka-tls-connection-error',
    description: 'Connessione TLS verso il cluster Kafka interrotta',
    regex: interopErrorLine(INTEROP_KAFKA_SIGNATURES.tlsDisconnected),
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Errore di rete o connessione verso il cluster Kafka prima dell’instaurazione TLS.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownCase(REFS, {
    id: 'tenant-readmodel-writer-sql-kafka-coordinator-unknown-member',
    description: 'Il coordinator Kafka non riconosce il consumer, che rientra nel consumer group',
    regex: interopErrorLine(
      INTEROP_KAFKA_SIGNATURES.unknownMemberHeartbeat,
      INTEROP_KAFKA_SIGNATURES.unknownMemberRejoinWithReason,
    ),
    resolution: 'Risoluzione non documentata. Riferimento: PIN-7325.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'Il coordinator Kafka non riconosce il consumer del tenant readmodel writer SQL, che tenta il rejoin del gruppo.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
  }),
];
