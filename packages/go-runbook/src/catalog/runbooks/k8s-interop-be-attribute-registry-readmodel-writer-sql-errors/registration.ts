import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_REGISTRATION: AutomaticRunbookRegistration = {
  key: ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEROP'],
  alarmNames: ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.alarmNames,
  build: buildRunbook,
};
