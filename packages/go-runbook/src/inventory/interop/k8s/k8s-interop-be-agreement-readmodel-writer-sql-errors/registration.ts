import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/interop/index.js';
import { AGREEMENT_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const AGREEMENT_READMODEL_WRITER_SQL_REGISTRATION: RunbookRegistration = {
  key: alarm.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: alarm.alarmNames,
  build: buildRunbook,
};
