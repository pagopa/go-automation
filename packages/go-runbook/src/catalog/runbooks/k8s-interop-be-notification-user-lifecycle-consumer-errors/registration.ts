import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { NOTIFICATION_USER_LIFECYCLE_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const NOTIFICATION_USER_LIFECYCLE_REGISTRATION: RunbookRegistration = {
  key: NOTIFICATION_USER_LIFECYCLE_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: NOTIFICATION_USER_LIFECYCLE_ALARM.alarmNames,
  build: buildRunbook,
};
