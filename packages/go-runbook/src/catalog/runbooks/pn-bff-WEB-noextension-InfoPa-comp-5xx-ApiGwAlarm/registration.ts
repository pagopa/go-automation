import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { buildRunbook, INFO_PA_ALARM } from './runbook.js';

export const BFF_INFO_PA_REGISTRATION: RunbookRegistration = {
  key: INFO_PA_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.APIGW,
  categories: ['INTEGRATION'],
  alarmNames: [INFO_PA_ALARM],
  build: buildRunbook,
};
