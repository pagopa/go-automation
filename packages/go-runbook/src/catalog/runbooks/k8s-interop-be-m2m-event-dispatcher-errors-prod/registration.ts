import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { M2M_EVENT_DISPATCHER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const M2M_EVENT_DISPATCHER_REGISTRATION: RunbookRegistration = {
  key: M2M_EVENT_DISPATCHER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: M2M_EVENT_DISPATCHER_ALARM.alarmNames,
  build: buildRunbook,
};
