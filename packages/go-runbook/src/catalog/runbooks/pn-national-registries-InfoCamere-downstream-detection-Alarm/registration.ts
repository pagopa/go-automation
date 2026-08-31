import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildRunbook } from './runbook.js';

const KEY = 'pn-national-registries-InfoCamere-downstream-detection-Alarm';

export const NATIONAL_REGISTRIES_INFO_CAMERE_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEGRATION'],
  alarmNames: [KEY],
  build: buildRunbook,
};
