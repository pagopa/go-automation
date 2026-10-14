import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { NOTIFICATION_SCHEDULER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const NOTIFICATION_SCHEDULER_REGISTRATION: RunbookRegistration = {
  key: NOTIFICATION_SCHEDULER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: NOTIFICATION_SCHEDULER_ALARM.alarmNames,
  build: buildRunbook,
};
