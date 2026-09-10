import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const MANDATE_ACCEPTANCE_FAILURE_TECH_REGISTRATION: RunbookRegistration = {
  key: MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.SERVICE,
  categories: ['AUTHORIZATION'],
  alarmNames: [MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM],
  build: buildRunbook,
};
