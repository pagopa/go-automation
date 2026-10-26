import { RunbookKinds } from '../../../types/RunbookKind.js';

import type { RunbookRegistration } from '../../RunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildRunbook } from './runbook.js';

const KEY = 'Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm';

export const LAMBDA_DAILY_EXPORT_DYNAMO_DB_TABLE_LOG_INVOCATION_ERRORS_ALARM_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.LAMBDA,
  categories: ['MONITORING'],
  alarmNames: [KEY],
  build: buildRunbook,
};
