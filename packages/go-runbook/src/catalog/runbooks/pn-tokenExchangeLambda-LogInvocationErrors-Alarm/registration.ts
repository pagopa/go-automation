import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildRunbook } from './runbook.js';

const KEY = 'pn-tokenExchangeLambda-LogInvocationErrors-Alarm';

export const TOKEN_EXCHANGE_LAMBDA_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.LAMBDA,
  categories: ['AUTHORIZATION', 'INTEGRATION'],
  alarmNames: [KEY],
  build: buildRunbook,
};
