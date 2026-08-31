import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { NOTIFICATION_USER_LIFECYCLE_ALARM } from './alarmDefinition.js';
import { buildK8sInteropBeNotificationUserLifecycleConsumerErrorsRunbook } from './runbook.js';

export const NOTIFICATION_USER_LIFECYCLE_REGISTRATION: AutomaticRunbookRegistration = {
  key: NOTIFICATION_USER_LIFECYCLE_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEROP'],
  alarmNames: NOTIFICATION_USER_LIFECYCLE_ALARM.alarmNames,
  build: buildK8sInteropBeNotificationUserLifecycleConsumerErrorsRunbook,
};
