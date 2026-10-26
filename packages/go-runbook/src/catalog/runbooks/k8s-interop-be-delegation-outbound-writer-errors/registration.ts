import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { DELEGATION_OUTBOUND_WRITER_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const DELEGATION_OUTBOUND_WRITER_REGISTRATION: RunbookRegistration = {
  key: DELEGATION_OUTBOUND_WRITER_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: DELEGATION_OUTBOUND_WRITER_ALARM.alarmNames,
  build: buildRunbook,
};
