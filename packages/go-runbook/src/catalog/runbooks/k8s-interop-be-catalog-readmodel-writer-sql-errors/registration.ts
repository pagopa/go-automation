import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { CATALOG_READMODEL_WRITER_SQL_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const CATALOG_READMODEL_WRITER_SQL_REGISTRATION: AutomaticRunbookRegistration = {
  key: CATALOG_READMODEL_WRITER_SQL_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEROP'],
  alarmNames: CATALOG_READMODEL_WRITER_SQL_ALARM.alarmNames,
  build: buildRunbook,
};
