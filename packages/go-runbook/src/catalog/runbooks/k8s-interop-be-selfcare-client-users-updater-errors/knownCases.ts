import { SELFCARE_USERS_UPDATER_ALARM } from './alarmDefinition.js';
import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';

import { jiraLink } from '../common/analysisLinks.js';
import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { interopKnownCase } from '../interop/interopKnownCases.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: SELFCARE_USERS_UPDATER_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: SELFCARE_USERS_UPDATER_ALARM.stepIds.queryCidTracker,
  varPrefix: SELFCARE_USERS_UPDATER_ALARM.varPrefix,
};

const SELFCARE_USERS_UPDATER_KAFKA_PATTERN: string = [
  'The coordinator is not aware of this member',
  'The group coordinator is not available',
  'KafkaJS\\s*NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
  'Connection error: read ECONNRESET',
  "The coordinator is loading and hence can['’]t process requests for this group",
  'KafkaJS\\s*NumberOfRetriesExceeded: Request Metadata\\(key: 3, version: 6\\) timed out',
].join('|');

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'selfcare-kafka-broker-communication-errors',
    description: 'Errore di comunicazione KafkaJS verso i broker Selfcare',
    priority: 100,
    regex: SELFCARE_USERS_UPDATER_KAFKA_PATTERN,
    resolution:
      'Caso noto legato ai broker Kafka di Selfcare, al coordinator del consumer group o a un timeout nel recupero ' +
      'dei metadata. Verificare PIN-7325, correlare i CID e coinvolgere il team Selfcare se il problema persiste.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'KafkaJS non riesce a mantenere la comunicazione con il coordinator, la replica o i metadata del cluster.',
    downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
    finalActions: ['Verificare PIN-7325 e coinvolgere il team Selfcare se gli errori Kafka persistono'],
    links: [jiraLink('PIN-7325')],
  }),
];
