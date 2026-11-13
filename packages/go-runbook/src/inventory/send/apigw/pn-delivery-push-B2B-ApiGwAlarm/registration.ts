import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { buildRunbook } from './runbook.js';

const KEY = 'pn-delivery-push-B2B-ApiGwAlarm';

export const DELIVERY_PUSH_B2B_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.APIGW,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildRunbook,
};
