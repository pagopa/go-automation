import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildRunbook } from './runbook.js';

const KEY = 'pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm';

export const LOLLIPOP_AUTHORIZER_LAMBDA_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.LAMBDA,
  categories: ['AUTHORIZATION'],
  alarmNames: [KEY],
  build: buildRunbook,
};
