import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';

import { LOGSAVER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const LOGSAVER_REGISTRATION: RunbookRegistration = {
  key: LOGSAVER_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.SERVICE,
  categories: ['MONITORING'],
  alarmNames: [LOGSAVER_ALARM],
  build: buildRunbook,
};
