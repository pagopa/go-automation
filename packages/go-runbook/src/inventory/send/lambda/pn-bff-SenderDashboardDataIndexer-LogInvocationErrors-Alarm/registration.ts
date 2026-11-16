import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { SENDER_DASHBOARD_DATA_INDEXER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export { SENDER_DASHBOARD_DATA_INDEXER_ALARM } from './alarmDefinition.js';

export const SENDER_DASHBOARD_DATA_INDEXER_REGISTRATION: RunbookRegistration = {
  key: SENDER_DASHBOARD_DATA_INDEXER_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.LAMBDA,
  categories: ['DELIVERY'],
  alarmNames: [SENDER_DASHBOARD_DATA_INDEXER_ALARM],
  build: buildRunbook,
};
