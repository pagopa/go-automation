import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { interopKnownCase, type InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { PURPOSE_OUTBOUND_WRITER_ALARM as alarm } from './alarmDefinition.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'purpose-outbound-writer-kafka-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del consumer group',
    priority: 100,
    regex: 'The coordinator is not aware of this member, re-joining the group',
    resolution:
      'Considerare normale un picco limitato a circa un minuto. Se le occorrenze restano elevate e si protraggono per ore o giorni, notificare il team di prodotto.',
    // Il singolo log non dimostra la durata del fenomeno: la verifica operativa resta aperta.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer deve effettuare il rejoin perché il coordinator Kafka non riconosce il member.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Se le occorrenze restano elevate per ore o giorni, notificare il team di prodotto'],
  }),
];
