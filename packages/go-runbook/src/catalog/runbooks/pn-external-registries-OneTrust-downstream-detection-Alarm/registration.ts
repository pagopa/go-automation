import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildExternalRegistriesOneTrustDownstreamDetectionAlarmRunbook } from './runbook.js';

const KEY = 'pn-external-registries-OneTrust-downstream-detection-Alarm';

export const EXTERNAL_REGISTRIES_ONE_TRUST_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['INTEGRATION'],
  alarmNames: [KEY],
  build: buildExternalRegistriesOneTrustDownstreamDetectionAlarmRunbook,
};
