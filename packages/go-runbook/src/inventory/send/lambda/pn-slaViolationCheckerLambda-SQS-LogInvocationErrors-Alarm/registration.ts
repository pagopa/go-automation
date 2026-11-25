import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';

import { buildRunbook } from './runbook.js';

const KEY = 'pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm';

export const SLA_VIOLATION_CHECKER_LAMBDA_SQS_REGISTRATION: RunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: RunbookKinds.LAMBDA,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildRunbook,
};
