import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { buildRunbook } from './runbook.js';

const KEY = 'pn-external-registries-SelfcarePA-downstream-detection-Alarm';

export const EXTERNAL_REGISTRIES_SELFCARE_PA_DOWNSTREAM_DETECTION_ALARM_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.DOWNSTREAM,
  categories: ['INTEGRATION'],
  alarmNames: [KEY],
  build: buildRunbook,
};
