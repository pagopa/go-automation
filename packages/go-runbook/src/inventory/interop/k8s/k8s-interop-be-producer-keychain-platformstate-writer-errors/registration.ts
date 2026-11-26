import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/interop/index.js';
import { PRODUCER_KEYCHAIN_PLATFORMSTATE_WRITER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const PRODUCER_KEYCHAIN_PLATFORMSTATE_WRITER_REGISTRATION: RunbookRegistration = {
  key: PRODUCER_KEYCHAIN_PLATFORMSTATE_WRITER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: PRODUCER_KEYCHAIN_PLATFORMSTATE_WRITER_ALARM.alarmNames,
  build: buildRunbook,
};
