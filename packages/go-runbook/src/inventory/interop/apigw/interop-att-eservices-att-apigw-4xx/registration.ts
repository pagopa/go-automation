import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/interop/index.js';
import { ALARM_NAME } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const INTEROP_ATT_ESERVICES_4XX_REGISTRATION: RunbookRegistration = {
  key: ALARM_NAME,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.APIGW,
  categories: ['INTEROP'],
  alarmNames: [ALARM_NAME],
  build: buildRunbook,
};
