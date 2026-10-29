import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildRunbook } from './runbook.js';
import { SIGNED_OBJECTS_PERSISTER_ALARM as ALARM } from './alarmDefinition.js';

export const K8S_INTEROP_BE_SIGNED_OBJECTS_PERSISTER_ERRORS_PROD_REGISTRATION: RunbookRegistration = {
  key: ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: ALARM.alarmNames,
  build: buildRunbook,
};
