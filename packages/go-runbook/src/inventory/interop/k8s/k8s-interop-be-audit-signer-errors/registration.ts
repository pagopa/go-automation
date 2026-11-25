import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/interop/index.js';
import { AUDIT_SIGNER_ALARM as alarm } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const AUDIT_SIGNER_REGISTRATION: RunbookRegistration = {
  key: alarm.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: alarm.alarmNames,
  build: buildRunbook,
};
