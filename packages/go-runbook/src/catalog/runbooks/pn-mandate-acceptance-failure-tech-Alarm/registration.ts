import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const MANDATE_ACCEPTANCE_FAILURE_TECH_REGISTRATION: AutomaticRunbookRegistration = {
  key: MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['AUTHORIZATION'],
  alarmNames: [MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM],
  build: buildRunbook,
};
