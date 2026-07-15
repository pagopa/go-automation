import type { KnownCase } from '@go-automation/go-runbook';

import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { interopKnownCase } from '../interop/interopKnownCases.js';
import { INTEROP_SELFCARE_USERS_UPDATER_VAR_PREFIX } from './resolveInteropAlarmContext.js';
import { QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, QUERY_INTEROP_CID_TRACKER_STEP_ID } from './runbookSteps.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
  cidTrackerStepId: QUERY_INTEROP_CID_TRACKER_STEP_ID,
  varPrefix: INTEROP_SELFCARE_USERS_UPDATER_VAR_PREFIX,
};

const SELFCARE_KAFKA_ERROR_PATTERN = [
  'The coordinator is not aware of this member',
  'The group coordinator is not available',
  'KafkaJS\\s*NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
  'Connection error: read ECONNRESET',
].join('|');

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'selfcare-kafka-broker-communication-errors',
    description: 'Errore di comunicazione KafkaJS verso i broker Selfcare',
    priority: 100,
    regex: SELFCARE_KAFKA_ERROR_PATTERN,
    resolution:
      'Caso noto legato ai broker Kafka di Selfcare o a una temporanea indisponibilità di rete. ' +
      'Verificare PIN-7325 e, se il problema persiste, coinvolgere il team Selfcare.',
  }),
];
