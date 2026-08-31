import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildNationalRegistriesAdeDownstreamDetectionAlarmRunbook } from './runbook.js';

const KEY = 'pn-national-registries-AdE-downstream-detection-Alarm';

export const NATIONAL_REGISTRIES_ADE_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEGRATION'],
  alarmNames: [KEY],
  build: buildNationalRegistriesAdeDownstreamDetectionAlarmRunbook,
};
