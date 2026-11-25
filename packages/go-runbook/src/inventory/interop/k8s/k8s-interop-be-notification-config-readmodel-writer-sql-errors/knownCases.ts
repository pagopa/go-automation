import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopErrorLine,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';

import { NOTIFICATION_CONFIG_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'notification-config-readmodel-writer-sql-kafka-coordinator-member-rejoin',
    description: 'Mancata connessione al broker Kafka',
    environments: ['prod'],
    regex: interopErrorLine(INTEROP_KAFKA_SIGNATURES.unknownMemberRejoin),
    evidence: 'APPLICATION_LOGS',
    resolution:
      'Notificare a prodotto qualora le occorrenze dell’allarme siano elevate e prolungate nel tempo, cioè di ore o giorni. Se si osservano solo in una finestra temporale di un minuto o poco più, sono da considerarsi normali ai fini del funzionamento della piattaforma.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il coordinator Kafka non riconosce il consumer del writer SQL, che tenta il rejoin del gruppo.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
];
