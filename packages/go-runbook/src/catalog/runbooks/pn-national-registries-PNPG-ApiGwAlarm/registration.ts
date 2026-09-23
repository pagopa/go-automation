import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildRunbook } from './runbook.js';

const KEY = 'pn-national-registries-PNPG-ApiGwAlarm';

export const NATIONAL_REGISTRIES_PNPG_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.APIGW,
  categories: ['INTEGRATION'],
  alarmNames: [KEY],
  build: buildRunbook,
};
