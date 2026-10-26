import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildRunbook } from './runbook.js';

const KEY = 'pn-bff-WEB-noextension-NotificationReceived-comp-5xx-ApiGwAlarm';

export const BFF_WEB_NOEXTENSION_NOTIFICATION_RECEIVED_COMP_5XX_API_GW_ALARM_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.APIGW,
  categories: ['INTEGRATION'],
  alarmNames: [KEY],
  build: buildRunbook,
};
