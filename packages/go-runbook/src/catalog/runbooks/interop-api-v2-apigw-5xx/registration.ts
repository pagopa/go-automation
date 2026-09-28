import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { INTEROP_API_V2_5XX_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const INTEROP_API_V2_5XX_APIGW_REGISTRATION: RunbookRegistration = {
  key: INTEROP_API_V2_5XX_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.APIGW,
  categories: ['INTEROP'],
  alarmNames: INTEROP_API_V2_5XX_ALARM.alarmNames,
  build: buildRunbook,
};
