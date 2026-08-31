import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildNationalRegistriesPNPGApiGwAlarmRunbook } from './runbook.js';

const KEY = 'pn-national-registries-PNPG-ApiGwAlarm';

export const NATIONAL_REGISTRIES_PNPG_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.APIGW,
  categories: ['INTEGRATION'],
  alarmNames: [KEY],
  build: buildNationalRegistriesPNPGApiGwAlarmRunbook,
};
