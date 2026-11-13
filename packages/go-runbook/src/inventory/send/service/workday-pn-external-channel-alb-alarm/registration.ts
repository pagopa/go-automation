import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { buildRunbook } from './runbook.js';

const KEY = 'workday-pn-external-channel-alb-alarm';

export const WORKDAY_EXTERNAL_CHANNEL_ALB_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.SERVICE,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildRunbook,
};
