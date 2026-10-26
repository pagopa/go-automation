import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildRunbook } from './runbook.js';

const KEY = 'pn-stream-delivery-progress-B2B-ApiGwAlarm';

export const STREAM_DELIVERY_PROGRESS_B2B_API_GW_ALARM_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.APIGW,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildRunbook,
};
