import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { BFF_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const BFF_REGISTRATION: RunbookRegistration = {
  key: BFF_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: BFF_ALARM.alarmNames,
  build: buildRunbook,
};
