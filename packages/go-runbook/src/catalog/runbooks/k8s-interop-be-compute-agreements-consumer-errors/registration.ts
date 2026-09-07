import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { COMPUTE_AGREEMENTS_CONSUMER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const COMPUTE_AGREEMENTS_CONSUMER_REGISTRATION: AutomaticRunbookRegistration = {
  key: COMPUTE_AGREEMENTS_CONSUMER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEROP'],
  alarmNames: COMPUTE_AGREEMENTS_CONSUMER_ALARM.alarmNames,
  build: buildRunbook,
};
