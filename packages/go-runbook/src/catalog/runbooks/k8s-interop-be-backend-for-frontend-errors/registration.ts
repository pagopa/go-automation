import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { BFF_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const BFF_REGISTRATION: AutomaticRunbookRegistration = {
  key: BFF_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEROP'],
  alarmNames: BFF_ALARM.alarmNames,
  build: buildRunbook,
};
