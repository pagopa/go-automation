import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook } from './runbook.js';

const KEY = 'pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm';

export const JWKS_CACHE_REFRESH_LAMBDA_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.LAMBDA,
  categories: ['AUTHORIZATION'],
  alarmNames: [KEY],
  build: buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook,
};
