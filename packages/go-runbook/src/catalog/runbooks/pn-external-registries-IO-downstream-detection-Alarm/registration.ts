import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { EXTERNAL_REGISTRIES_IO_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const EXTERNAL_REGISTRIES_IO_REGISTRATION: RunbookRegistration = {
  key: EXTERNAL_REGISTRIES_IO_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.DOWNSTREAM,
  categories: ['INTEGRATION'],
  alarmNames: [EXTERNAL_REGISTRIES_IO_ALARM],
  build: buildRunbook,
};
