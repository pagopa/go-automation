import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { buildRunbook } from './runbook.js';

const KEY = 'pn-address-book-io-IO-ApiGwAlarm';

export const ADDRESS_BOOK_IO_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.APIGW,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildRunbook,
};
