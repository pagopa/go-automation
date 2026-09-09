import { SELFCARE_USERS_UPDATER_ALARM } from './alarmDefinition.js';
import type { KnownCase } from '../framework.js';

import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { createSelfcareKafkaBrokerCommunicationKnownCase } from '../interop/selfcareKafkaKnownCase.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: SELFCARE_USERS_UPDATER_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: SELFCARE_USERS_UPDATER_ALARM.stepIds.queryCidTracker,
  varPrefix: SELFCARE_USERS_UPDATER_ALARM.varPrefix,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [createSelfcareKafkaBrokerCommunicationKnownCase(REFS)];
