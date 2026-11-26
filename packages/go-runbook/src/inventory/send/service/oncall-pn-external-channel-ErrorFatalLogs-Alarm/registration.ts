import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { EXTERNAL_CHANNEL_FATAL_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const EXTERNAL_CHANNEL_FATAL_REGISTRATION: RunbookRegistration = {
  key: EXTERNAL_CHANNEL_FATAL_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.SERVICE,
  categories: ['DELIVERY'],
  alarmNames: [EXTERNAL_CHANNEL_FATAL_ALARM],
  build: buildRunbook,
};
