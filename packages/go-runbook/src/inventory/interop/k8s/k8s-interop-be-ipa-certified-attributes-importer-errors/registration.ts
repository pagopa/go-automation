import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/interop/index.js';
import { IPA_IMPORTER_ALARM as alarm } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const IPA_IMPORTER_REGISTRATION: RunbookRegistration = {
  key: alarm.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: alarm.alarmNames,
  build: buildRunbook,
};
