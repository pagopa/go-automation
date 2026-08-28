import type { KnownCase } from '../framework.js';

import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { createSelfcareKafkaBrokerCommunicationKnownCase } from '../interop/selfcareKafkaKnownCase.js';
import { INTEROP_SELFCARE_USERS_UPDATER_VAR_PREFIX } from './resolveInteropAlarmContext.js';
import { QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, QUERY_INTEROP_CID_TRACKER_STEP_ID } from './runbookSteps.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
  cidTrackerStepId: QUERY_INTEROP_CID_TRACKER_STEP_ID,
  varPrefix: INTEROP_SELFCARE_USERS_UPDATER_VAR_PREFIX,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [createSelfcareKafkaBrokerCommunicationKnownCase(REFS)];
