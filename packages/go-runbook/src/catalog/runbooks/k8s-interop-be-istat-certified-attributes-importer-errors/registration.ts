import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { ISTAT_IMPORTER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const ISTAT_IMPORTER_REGISTRATION: RunbookRegistration = {
  key: ISTAT_IMPORTER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: ISTAT_IMPORTER_ALARM.alarmNames,
  build: buildRunbook,
};
