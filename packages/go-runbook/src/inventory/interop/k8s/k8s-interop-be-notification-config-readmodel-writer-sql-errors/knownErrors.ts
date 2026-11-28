import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopErrorLine,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

import { NOTIFICATION_CONFIG_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNCRWSE_NOT-CON-REA-WRI-SQL-KAF-COO-MEM-REJ',
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
