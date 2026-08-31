import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { AUTH_SERVER_ALARM } from './alarmDefinition.js';
import { buildInteropAuthServerApiGw4xxRunbook } from './runbook.js';

export const AUTH_SERVER_APIGW_REGISTRATION: AutomaticRunbookRegistration = {
  key: AUTH_SERVER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: AutomaticRunbookKinds.APIGW,
  categories: ['INTEROP'],
  alarmNames: AUTH_SERVER_ALARM.alarmNames,
  build: buildInteropAuthServerApiGw4xxRunbook,
};
