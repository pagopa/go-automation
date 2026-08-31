import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { PUBLIC_CATALOG_ALARM } from './alarmDefinition.js';
import { buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook } from './runbook.js';

export const PUBLIC_CATALOG_REGISTRATION: AutomaticRunbookRegistration = {
  key: PUBLIC_CATALOG_ALARM.runbookKey,
  product: RunbookProducts.INTEROP,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEROP'],
  alarmNames: PUBLIC_CATALOG_ALARM.alarmNames,
  build: buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook,
};
