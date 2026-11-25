import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/interop/index.js';
import { PURPOSE_READMODEL_WRITER_SQL_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const PURPOSE_READMODEL_WRITER_SQL_REGISTRATION: RunbookRegistration = {
  key: PURPOSE_READMODEL_WRITER_SQL_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: PURPOSE_READMODEL_WRITER_SQL_ALARM.alarmNames,
  build: buildRunbook,
};
