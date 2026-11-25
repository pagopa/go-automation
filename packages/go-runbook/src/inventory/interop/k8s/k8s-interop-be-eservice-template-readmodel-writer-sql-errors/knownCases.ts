import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';
import { ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'eservice-template-readmodel-writer-sql-kafka-coordinator-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del writer SQL dei template e-service',
    regex: INTEROP_KAFKA_SIGNATURES.unknownMemberRejoin,
    resolution:
      'Se le occorrenze sono poche e in intervalli di tempo piccoli (qualche minuto) non ci sono azioni da fare. Se il disservizio continua per ore o giorni, contattare il team prodotto',
    // La procedura richiede di valutare frequenza e durata: un singolo match non basta per chiudere automaticamente.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer deve effettuare il rejoin perché il coordinator Kafka non riconosce il member.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
];
