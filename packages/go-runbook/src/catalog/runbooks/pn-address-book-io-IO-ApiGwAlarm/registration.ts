import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildAddressBookIoApiGwAlarmRunbook } from './runbook.js';

const KEY = 'pn-address-book-io-IO-ApiGwAlarm';

export const ADDRESS_BOOK_IO_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.APIGW,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildAddressBookIoApiGwAlarmRunbook,
};
