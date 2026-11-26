import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { DELAYER_RESIDUAL_CAPACITY_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const DELAYER_RESIDUAL_CAPACITY_REGISTRATION: RunbookRegistration = {
  key: DELAYER_RESIDUAL_CAPACITY_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.SERVICE,
  categories: ['DELIVERY'],
  alarmNames: [DELAYER_RESIDUAL_CAPACITY_ALARM],
  build: buildRunbook,
};
