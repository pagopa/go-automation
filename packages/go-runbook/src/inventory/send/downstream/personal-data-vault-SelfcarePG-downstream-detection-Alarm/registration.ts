import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { buildRunbook } from './runbook.js';

const KEY = 'personal-data-vault-SelfcarePG-downstream-detection-Alarm';

export const PERSONAL_DATA_VAULT_SELFCARE_PG_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.DOWNSTREAM,
  categories: ['INTEGRATION'],
  alarmNames: [KEY],
  build: buildRunbook,
};
