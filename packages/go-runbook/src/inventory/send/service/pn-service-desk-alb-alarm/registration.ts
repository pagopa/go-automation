import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { buildRunbook } from './runbook.js';

const KEY = 'pn-service-desk-alb-alarm';

export const SERVICE_DESK_ALB_ALARM_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.SERVICE,
  categories: ['MONITORING'],
  alarmNames: [KEY],
  build: buildRunbook,
};
