import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';

import { DELAYER_SENDER_LIMIT_JOB_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const DELAYER_SENDER_LIMIT_JOB_REGISTRATION: RunbookRegistration = {
  key: DELAYER_SENDER_LIMIT_JOB_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.SERVICE,
  categories: ['DELIVERY'],
  alarmNames: [DELAYER_SENDER_LIMIT_JOB_ALARM],
  build: buildRunbook,
};
