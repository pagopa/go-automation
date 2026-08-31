import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { SELFCARE_USERS_UPDATER_ALARM } from './alarmDefinition.js';
import { buildK8sInteropBeSelfcareClientUsersUpdaterErrorsRunbook } from './runbook.js';

export const SELFCARE_USERS_UPDATER_REGISTRATION: AutomaticRunbookRegistration = {
  key: SELFCARE_USERS_UPDATER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEROP'],
  alarmNames: SELFCARE_USERS_UPDATER_ALARM.alarmNames,
  build: buildK8sInteropBeSelfcareClientUsersUpdaterErrorsRunbook,
};
