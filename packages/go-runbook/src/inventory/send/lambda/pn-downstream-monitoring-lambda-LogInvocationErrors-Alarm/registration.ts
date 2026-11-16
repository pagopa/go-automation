import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { DOWNSTREAM_MONITORING_LAMBDA_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export { DOWNSTREAM_MONITORING_LAMBDA_ALARM } from './alarmDefinition.js';

export const DOWNSTREAM_MONITORING_LAMBDA_REGISTRATION: RunbookRegistration = {
  key: DOWNSTREAM_MONITORING_LAMBDA_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.LAMBDA,
  categories: ['INTEGRATION'],
  alarmNames: [DOWNSTREAM_MONITORING_LAMBDA_ALARM],
  build: buildRunbook,
};
