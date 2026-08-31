import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildPersonalDataVaultSelfcarePgDownstreamDetectionAlarmRunbook } from './runbook.js';

const KEY = 'personal-data-vault-SelfcarePG-downstream-detection-Alarm';

export const PERSONAL_DATA_VAULT_SELFCARE_PG_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEGRATION'],
  alarmNames: [KEY],
  build: buildPersonalDataVaultSelfcarePgDownstreamDetectionAlarmRunbook,
};
