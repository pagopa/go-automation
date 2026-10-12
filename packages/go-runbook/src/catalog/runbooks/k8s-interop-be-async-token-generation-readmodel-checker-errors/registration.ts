import { RunbookKinds } from '../../../types/RunbookKind.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_ALARM as alarm } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_REGISTRATION: RunbookRegistration = {
  key: alarm.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: alarm.alarmNames,
  build: buildRunbook,
};
