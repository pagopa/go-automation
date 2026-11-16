import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/interop/index.js';

import { COMPUTE_AGREEMENTS_CONSUMER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const COMPUTE_AGREEMENTS_CONSUMER_REGISTRATION: RunbookRegistration = {
  key: COMPUTE_AGREEMENTS_CONSUMER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: COMPUTE_AGREEMENTS_CONSUMER_ALARM.alarmNames,
  build: buildRunbook,
};
