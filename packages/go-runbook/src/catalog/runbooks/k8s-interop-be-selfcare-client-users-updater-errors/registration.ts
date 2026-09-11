import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { SELFCARE_USERS_UPDATER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const SELFCARE_USERS_UPDATER_REGISTRATION: RunbookRegistration = {
  key: SELFCARE_USERS_UPDATER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: SELFCARE_USERS_UPDATER_ALARM.alarmNames,
  build: buildRunbook,
};
