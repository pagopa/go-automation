import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/interop/index.js';
import { NOTIFIER_SEEDER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const NOTIFIER_SEEDER_REGISTRATION: RunbookRegistration = {
  key: NOTIFIER_SEEDER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: NOTIFIER_SEEDER_ALARM.alarmNames,
  build: buildRunbook,
};
