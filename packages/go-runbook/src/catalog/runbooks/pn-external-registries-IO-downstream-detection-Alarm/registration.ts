import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { EXTERNAL_REGISTRIES_IO_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const EXTERNAL_REGISTRIES_IO_REGISTRATION: AutomaticRunbookRegistration = {
  key: EXTERNAL_REGISTRIES_IO_ALARM,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEGRATION'],
  alarmNames: [EXTERNAL_REGISTRIES_IO_ALARM],
  build: buildRunbook,
};
