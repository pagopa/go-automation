import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { buildRunbook } from './runbook.js';

const KEY = 'emd-downstream-detection-Alarm';

export const EMD_DOWNSTREAM_DETECTION_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.DOWNSTREAM,
  categories: ['INTEGRATION'],
  alarmNames: [KEY],
  build: buildRunbook,
};
