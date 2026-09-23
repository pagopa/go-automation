import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { SELFCARE_ONBOARDING_CONSUMER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const SELFCARE_ONBOARDING_CONSUMER_REGISTRATION: RunbookRegistration = {
  key: SELFCARE_ONBOARDING_CONSUMER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: SELFCARE_ONBOARDING_CONSUMER_ALARM.alarmNames,
  build: buildRunbook,
};
