import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';
import { SPIDHUB_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const SPIDHUB_EXTERNAL_ELB_REGISTRATION: RunbookRegistration = {
  key: SPIDHUB_ALARM,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.SERVICE,
  categories: ['AUTHENTICATION'],
  alarmNames: [SPIDHUB_ALARM],
  build: buildRunbook,
};
