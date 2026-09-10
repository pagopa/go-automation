import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildRunbook } from './runbook.js';

const KEY = 'pn-tokenExchangeLambda-LogInvocationErrors-Alarm';

export const TOKEN_EXCHANGE_LAMBDA_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.LAMBDA,
  categories: ['AUTHORIZATION', 'INTEGRATION'],
  alarmNames: [KEY],
  build: buildRunbook,
};
