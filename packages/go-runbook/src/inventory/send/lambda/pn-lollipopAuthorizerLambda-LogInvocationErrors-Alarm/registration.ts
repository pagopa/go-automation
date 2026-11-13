import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { buildRunbook } from './runbook.js';

const KEY = 'pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm';

export const LOLLIPOP_AUTHORIZER_LAMBDA_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.LAMBDA,
  categories: ['AUTHORIZATION'],
  alarmNames: [KEY],
  build: buildRunbook,
};
