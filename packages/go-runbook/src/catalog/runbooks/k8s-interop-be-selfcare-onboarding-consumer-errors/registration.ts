import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { SELFCARE_ONBOARDING_CONSUMER_ALARM } from './alarmDefinition.js';
import { buildK8sInteropBeSelfcareOnboardingConsumerErrorsRunbook } from './runbook.js';

export const SELFCARE_ONBOARDING_CONSUMER_REGISTRATION: AutomaticRunbookRegistration = {
  key: SELFCARE_ONBOARDING_CONSUMER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEROP'],
  alarmNames: SELFCARE_ONBOARDING_CONSUMER_ALARM.alarmNames,
  build: buildK8sInteropBeSelfcareOnboardingConsumerErrorsRunbook,
};
