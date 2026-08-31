import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { SELFCARE_ALARM } from './alarmDefinition.js';
import { buildInteropSelfcareApiGw5xxRunbook } from './runbook.js';

export const SELFCARE_APIGW_REGISTRATION: AutomaticRunbookRegistration = {
  key: SELFCARE_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: AutomaticRunbookKinds.APIGW,
  categories: ['INTEROP'],
  alarmNames: SELFCARE_ALARM.alarmNames,
  build: buildInteropSelfcareApiGw5xxRunbook,
};
