/**
 * Runbook registry: maps alarm names to their runbook builders.
 *
 * Single source of truth shared by the CLI (`main.ts`) and the in-process
 * executor (`executeRunbookForOccurrence`, consumed by `go-rta-check`).
 */
import type { Runbook } from '@go-automation/go-runbook';

// api gateway
import { buildAddressBookIoApiGwAlarmRunbook } from './runbooks/pn-address-book-io-IO-ApiGwAlarm/runbook.js';
import { buildDeliveryB2BApiGwAlarmRunbook } from './runbooks/pn-delivery-B2B-ApiGwAlarm/runbook.js';
import { buildDeliveryIoExpApiGwAlarmRunbook } from './runbooks/pn-delivery-IO_EXP-ApiGwAlarm/runbook.js';
import { buildDeliveryPushB2BApiGwAlarmRunbook } from './runbooks/pn-delivery-push-B2B-ApiGwAlarm/runbook.js';
import { buildNationalRegistriesPNPGApiGwAlarmRunbook } from './runbooks/pn-national-registries-PNPG-ApiGwAlarm/runbook.js';

// lambda
import { buildIoAuthorizerLambdaRunbook } from './runbooks/pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildTokenExchangeLambdaRunbook } from './runbooks/pn-tokenExchangeLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildSlaViolationCheckerLambdaSqsRunbook } from './runbooks/pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm/runbook.js';
import { buildApiKeyAuthorizerV2LambdaLogInvocationErrorsAlarmRunbook } from './runbooks/pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm/runbook.js';
import { buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook } from './runbooks/pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook } from './runbooks/pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm/runbook.js';

/** Maps alarm names (= runbook ids) to their runbook builders. */
export const RUNBOOK_REGISTRY: ReadonlyMap<string, () => Runbook> = new Map<string, () => Runbook>([
  ['pn-address-book-io-IO-ApiGwAlarm', buildAddressBookIoApiGwAlarmRunbook],
  ['pn-delivery-B2B-ApiGwAlarm', buildDeliveryB2BApiGwAlarmRunbook],
  ['pn-delivery-IO_EXP-ApiGwAlarm', buildDeliveryIoExpApiGwAlarmRunbook],
  ['pn-delivery-push-B2B-ApiGwAlarm', buildDeliveryPushB2BApiGwAlarmRunbook],
  ['pn-national-registries-PNPG-ApiGwAlarm', buildNationalRegistriesPNPGApiGwAlarmRunbook],
  ['pn-ioAuthorizerLambda-LogInvocationErrors-Alarm', buildIoAuthorizerLambdaRunbook],
  ['pn-tokenExchangeLambda-LogInvocationErrors-Alarm', buildTokenExchangeLambdaRunbook],
  ['pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm', buildSlaViolationCheckerLambdaSqsRunbook],
  [
    'pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm',
    buildApiKeyAuthorizerV2LambdaLogInvocationErrorsAlarmRunbook,
  ],
  ['pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm', buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook],
  [
    'pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm',
    buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook,
  ],
]);
