import { SELFCARE_ONBOARDING_CONSUMER_ALARM } from './alarmDefinition.js';
import type { KnownCase } from '../framework.js';

import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { createSelfcareKafkaBrokerCommunicationKnownCase } from '../interop/selfcareKafkaKnownCase.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.queryCidTracker,
  varPrefix: SELFCARE_ONBOARDING_CONSUMER_ALARM.varPrefix,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [createSelfcareKafkaBrokerCommunicationKnownCase(REFS)];
