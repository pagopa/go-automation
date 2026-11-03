import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';
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
