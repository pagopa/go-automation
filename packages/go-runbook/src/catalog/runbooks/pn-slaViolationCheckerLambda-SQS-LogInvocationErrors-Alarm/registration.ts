import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildRunbook } from './runbook.js';

const KEY = 'pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm';

export const SLA_VIOLATION_CHECKER_LAMBDA_SQS_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.LAMBDA,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildRunbook,
};
