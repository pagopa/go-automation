import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { buildRunbook } from './runbook.js';

const KEY = 'pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm';

export const DELIVERY_INSERT_TRIGGER_EB_LAMBDA_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.LAMBDA,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildRunbook,
};
