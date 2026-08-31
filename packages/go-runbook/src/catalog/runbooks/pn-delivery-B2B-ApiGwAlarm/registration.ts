import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildDeliveryB2BApiGwAlarmRunbook } from './runbook.js';

const KEY = 'pn-delivery-B2B-ApiGwAlarm';

export const DELIVERY_B2B_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.APIGW,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildDeliveryB2BApiGwAlarmRunbook,
};
