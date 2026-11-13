import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/interop/index.js';

import { SELFCARE_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const SELFCARE_APIGW_REGISTRATION: RunbookRegistration = {
  key: SELFCARE_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.APIGW,
  categories: ['INTEROP'],
  alarmNames: SELFCARE_ALARM.alarmNames,
  build: buildRunbook,
};
