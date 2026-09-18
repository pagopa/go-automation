import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_REGISTRATION: RunbookRegistration = {
  key: ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_ALARM.alarmNames,
  build: buildRunbook,
};
