import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { METADATA_STATUS_UPDATER_ESM_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const METADATA_STATUS_UPDATER_ESM_REGISTRATION: RunbookRegistration = {
  key: METADATA_STATUS_UPDATER_ESM_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.LAMBDA,
  categories: ['DELIVERY'],
  alarmNames: [METADATA_STATUS_UPDATER_ESM_ALARM],
  build: buildRunbook,
};
