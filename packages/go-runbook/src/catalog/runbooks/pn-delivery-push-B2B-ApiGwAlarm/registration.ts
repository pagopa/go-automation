import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildDeliveryPushB2BApiGwAlarmRunbook } from './runbook.js';

const KEY = 'pn-delivery-push-B2B-ApiGwAlarm';

export const DELIVERY_PUSH_B2B_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.APIGW,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildDeliveryPushB2BApiGwAlarmRunbook,
};
