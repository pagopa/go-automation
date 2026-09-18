import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { interopKnownCase, type InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'eservice-template-readmodel-writer-sql-kafka-coordinator-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del writer SQL dei template e-service',
    priority: 100,
    regex: 'The coordinator is not aware of this member,\\s*re-joining the group',
    resolution:
      'Nessuna azione se le occorrenze sono poche e concentrate in pochi minuti. Verificare anche lo stato del pod ' +
      'se il volume è elevato; se il disservizio prosegue per ore o giorni, contattare il team di prodotto.',
    // La procedura richiede di valutare frequenza e durata: un singolo match non basta per chiudere automaticamente.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer deve effettuare il rejoin perché il coordinator Kafka non riconosce il member.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [
      'Valutare frequenza e durata delle occorrenze, verificare il pod se il volume è elevato e contattare il team di prodotto se il fenomeno persiste',
    ],
  }),
];
