import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { AUTH_SERVER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const AUTH_SERVER_APIGW_REGISTRATION: RunbookRegistration = {
  key: AUTH_SERVER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.APIGW,
  categories: ['INTEROP'],
  alarmNames: AUTH_SERVER_ALARM.alarmNames,
  build: buildRunbook,
};
