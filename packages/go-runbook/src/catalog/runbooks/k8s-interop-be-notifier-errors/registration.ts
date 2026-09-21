import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { NOTIFIER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const NOTIFIER_REGISTRATION: RunbookRegistration = {
  key: NOTIFIER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: NOTIFIER_ALARM.alarmNames,
  build: buildRunbook,
};
