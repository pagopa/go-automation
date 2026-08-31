import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook } from './runbook.js';

const KEY = 'pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm';

export const DELIVERY_INSERT_TRIGGER_EB_LAMBDA_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.LAMBDA,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook,
};
