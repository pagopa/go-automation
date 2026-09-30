import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';

import { CDC_PREPROC_DATA_QUALITY_FILTER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const CDC_PREPROC_DATA_QUALITY_FILTER_REGISTRATION: RunbookRegistration = {
  key: CDC_PREPROC_DATA_QUALITY_FILTER_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.LAMBDA,
  categories: ['INTEGRATION'],
  alarmNames: [CDC_PREPROC_DATA_QUALITY_FILTER_ALARM],
  build: buildRunbook,
};
