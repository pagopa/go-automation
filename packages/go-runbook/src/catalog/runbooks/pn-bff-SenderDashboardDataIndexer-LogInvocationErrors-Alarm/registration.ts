import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { SENDER_DASHBOARD_DATA_INDEXER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export { SENDER_DASHBOARD_DATA_INDEXER_ALARM } from './alarmDefinition.js';

export const SENDER_DASHBOARD_DATA_INDEXER_REGISTRATION: AutomaticRunbookRegistration = {
  key: SENDER_DASHBOARD_DATA_INDEXER_ALARM,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.LAMBDA,
  categories: ['DELIVERY'],
  alarmNames: [SENDER_DASHBOARD_DATA_INDEXER_ALARM],
  build: buildRunbook,
};
