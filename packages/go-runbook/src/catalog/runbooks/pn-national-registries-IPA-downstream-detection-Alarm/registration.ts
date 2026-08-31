import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildNationalRegistriesIpaDownstreamDetectionAlarmRunbook } from './runbook.js';

const KEY = 'pn-national-registries-IPA-downstream-detection-Alarm';

export const NATIONAL_REGISTRIES_IPA_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEGRATION'],
  alarmNames: [KEY],
  build: buildNationalRegistriesIpaDownstreamDetectionAlarmRunbook,
};
