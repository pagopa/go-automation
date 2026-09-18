import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { AUTHORIZATION_PROCESS_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const AUTHORIZATION_PROCESS_REGISTRATION: RunbookRegistration = {
  key: AUTHORIZATION_PROCESS_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: AUTHORIZATION_PROCESS_ALARM.alarmNames,
  build: buildRunbook,
};
