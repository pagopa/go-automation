import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { CATALOG_READMODEL_WRITER_SQL_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const CATALOG_READMODEL_WRITER_SQL_REGISTRATION: RunbookRegistration = {
  key: CATALOG_READMODEL_WRITER_SQL_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: CATALOG_READMODEL_WRITER_SQL_ALARM.alarmNames,
  build: buildRunbook,
};
