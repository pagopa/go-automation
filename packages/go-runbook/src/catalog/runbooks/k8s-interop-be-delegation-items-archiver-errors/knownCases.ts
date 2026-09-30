import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { jiraLink } from '../common/analysisLinks.js';
import { interopKnownCase, type InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { DELEGATION_ITEMS_ARCHIVER_ALARM as alarm } from './alarmDefinition.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'delegation-items-archiver-kafka-heartbeat-unknown-member',
    description: 'Il coordinator Kafka non riconosce il consumer durante l’heartbeat',
    priority: 100,
    regex:
      'ERROR\\s*-\\s*Response Heartbeat\\(key:\\s*12, version:\\s*3\\)\\s*-\\s*The coordinator is not aware of this member',
    resolution:
      'Dai log la causa non è determinabile. Correlare gli eventuali CID, verificare il rejoin del consumer ' +
      'e la persistenza dell’errore, e consultare PIN-7325 per lo stato della verifica.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il group coordinator Kafka non riconosce il consumer come membro del consumer group.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare il rejoin del consumer, la persistenza dell’errore e lo stato di PIN-7325'],
    links: [jiraLink('PIN-7325')],
  }),
];
