import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/interop/index.js';

import { PUBLIC_CATALOG_ALARM } from './alarmDefinition.js';
import { buildRunbook } from './runbook.js';

export const PUBLIC_CATALOG_REGISTRATION: RunbookRegistration = {
  key: PUBLIC_CATALOG_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: RunbookKinds.K8S,
  categories: ['INTEROP'],
  alarmNames: PUBLIC_CATALOG_ALARM.alarmNames,
  build: buildRunbook,
};
