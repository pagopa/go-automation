/**
 * SEND runbooks of the inventory, by family (`./<family>/<alarm>/`).
 *
 * Maintained by hand or by `pnpm create:runbook`: to add a runbook, declare its
 * identity in `<family>/<alarm>/registration.ts` and add the import and the
 * array entry in the block of its family. Collisions of keys and alarm names
 * are checked globally by the registry (`../registry/`), across products.
 */
import type { RunbookRegistration } from '../../toolkits/send/index.js';

// API Gateway
import { ADDRESS_BOOK_IO_REGISTRATION } from './apigw/pn-address-book-io-IO-ApiGwAlarm/registration.js';
import { DELIVERY_B2B_REGISTRATION } from './apigw/pn-delivery-B2B-ApiGwAlarm/registration.js';
import { DELIVERY_IO_EXP_REGISTRATION } from './apigw/pn-delivery-IO_EXP-ApiGwAlarm/registration.js';
import { DELIVERY_PUSH_B2B_REGISTRATION } from './apigw/pn-delivery-push-B2B-ApiGwAlarm/registration.js';
import { NATIONAL_REGISTRIES_PNPG_REGISTRATION } from './apigw/pn-national-registries-PNPG-ApiGwAlarm/registration.js';
import { BFF_INFO_PA_REGISTRATION } from './apigw/pn-bff-WEB-noextension-InfoPa-comp-5xx-ApiGwAlarm/registration.js';
import { BFF_WEB_NOEXTENSION_NOTIFICATION_RECEIVED_COMP_5XX_API_GW_ALARM_REGISTRATION } from './apigw/pn-bff-WEB-noextension-NotificationReceived-comp-5xx-ApiGwAlarm/registration.js';
import { STREAM_DELIVERY_PROGRESS_B2B_API_GW_ALARM_REGISTRATION } from './apigw/pn-stream-delivery-progress-B2B-ApiGwAlarm/registration.js';
import { BFF_WEB_NOEXTENSION_ADDRESSES_COMP_5XX_API_GW_ALARM_REGISTRATION } from './apigw/pn-bff-WEB-noextension-Addresses-comp-5xx-ApiGwAlarm/registration.js';
// Lambda
import { IO_AUTHORIZER_LAMBDA_REGISTRATION } from './lambda/pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/registration.js';
import { TOKEN_EXCHANGE_LAMBDA_REGISTRATION } from './lambda/pn-tokenExchangeLambda-LogInvocationErrors-Alarm/registration.js';
import { SLA_VIOLATION_CHECKER_LAMBDA_SQS_REGISTRATION } from './lambda/pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm/registration.js';
import { API_KEY_AUTHORIZER_V2_LAMBDA_REGISTRATION } from './lambda/pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm/registration.js';
import { JWKS_CACHE_REFRESH_LAMBDA_REGISTRATION } from './lambda/pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm/registration.js';
import { DELIVERY_INSERT_TRIGGER_EB_LAMBDA_REGISTRATION } from './lambda/pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm/registration.js';
import { LOLLIPOP_AUTHORIZER_LAMBDA_REGISTRATION } from './lambda/pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm/registration.js';
import { SENDER_DASHBOARD_DATA_INDEXER_REGISTRATION } from './lambda/pn-bff-SenderDashboardDataIndexer-LogInvocationErrors-Alarm/registration.js';
import { DOWNSTREAM_MONITORING_LAMBDA_REGISTRATION } from './lambda/pn-downstream-monitoring-lambda-LogInvocationErrors-Alarm/registration.js';
import { CDC_PREPROC_DATA_QUALITY_FILTER_REGISTRATION } from './lambda/pn-cdc-preproc-data-quality-filter-LogInvocationErrors-Alarm/registration.js';
import { LAMBDA_DAILY_EXPORT_DYNAMO_DB_TABLE_LOG_INVOCATION_ERRORS_ALARM_REGISTRATION } from './lambda/Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm/registration.js';
import { JWT_AUTHORIZER_LAMBDA_LOG_INVOCATION_ERRORS_ALARM_REGISTRATION } from './lambda/pn-jwtAuthorizerLambda-LogInvocationErrors-Alarm/registration.js';
// downstream
import { EMD_DOWNSTREAM_DETECTION_REGISTRATION } from './downstream/emd-downstream-detection-Alarm/registration.js';
import { EXTERNAL_REGISTRIES_ONE_TRUST_REGISTRATION } from './downstream/pn-external-registries-OneTrust-downstream-detection-Alarm/registration.js';
import { EXTERNAL_REGISTRIES_IO_REGISTRATION } from './downstream/pn-external-registries-IO-downstream-detection-Alarm/registration.js';
import { NATIONAL_REGISTRIES_IPA_REGISTRATION } from './downstream/pn-national-registries-IPA-downstream-detection-Alarm/registration.js';
import { NATIONAL_REGISTRIES_ANPR_REGISTRATION } from './downstream/pn-national-registries-ANPR-downstream-detection-Alarm/registration.js';
import { NATIONAL_REGISTRIES_INFO_CAMERE_REGISTRATION } from './downstream/pn-national-registries-InfoCamere-downstream-detection-Alarm/registration.js';
import { NATIONAL_REGISTRIES_ADE_REGISTRATION } from './downstream/pn-national-registries-AdE-downstream-detection-Alarm/registration.js';
import { NATIONAL_REGISTRIES_INAD_REGISTRATION } from './downstream/pn-national-registries-INAD-downstream-detection-Alarm/registration.js';
import { ADDRESS_MANAGER_POSTEL_REGISTRATION } from './downstream/pn-address-manager-POSTEL-downstream-detection-Alarm/registration.js';
import { PERSONAL_DATA_VAULT_SELFCARE_PG_REGISTRATION } from './downstream/personal-data-vault-SelfcarePG-downstream-detection-Alarm/registration.js';
import { EXTERNAL_REGISTRIES_SELFCARE_PA_DOWNSTREAM_DETECTION_ALARM_REGISTRATION } from './downstream/pn-external-registries-SelfcarePA-downstream-detection-Alarm/registration.js';
// log applicativi
import { WORKDAY_EXTERNAL_CHANNEL_ALB_REGISTRATION } from './service/workday-pn-external-channel-alb-alarm/registration.js';
import { MANDATE_ACCEPTANCE_FAILURE_TECH_REGISTRATION } from './service/pn-mandate-acceptance-failure-tech-Alarm/registration.js';
import { DELAYER_SENDER_LIMIT_JOB_REGISTRATION } from './service/pn-delayer-sender-limit-job-ErrorFatalLogs-Alarm/registration.js';
import { LOGSAVER_REGISTRATION } from './service/pn-logsaver-be-FailedInvocation-Alarm/registration.js';
import { SPIDHUB_EXTERNAL_ELB_REGISTRATION } from './service/spidhub-prod-ExternalELBAlarm/registration.js';
import { SERVICE_DESK_ALB_ALARM_REGISTRATION } from './service/pn-service-desk-alb-alarm/registration.js';

export const SEND_MANIFEST: ReadonlyArray<RunbookRegistration> = [
  // API Gateway
  ADDRESS_BOOK_IO_REGISTRATION,
  DELIVERY_B2B_REGISTRATION,
  DELIVERY_IO_EXP_REGISTRATION,
  DELIVERY_PUSH_B2B_REGISTRATION,
  NATIONAL_REGISTRIES_PNPG_REGISTRATION,
  BFF_INFO_PA_REGISTRATION,
  BFF_WEB_NOEXTENSION_NOTIFICATION_RECEIVED_COMP_5XX_API_GW_ALARM_REGISTRATION,
  STREAM_DELIVERY_PROGRESS_B2B_API_GW_ALARM_REGISTRATION,
  BFF_WEB_NOEXTENSION_ADDRESSES_COMP_5XX_API_GW_ALARM_REGISTRATION,
  // Lambda
  IO_AUTHORIZER_LAMBDA_REGISTRATION,
  TOKEN_EXCHANGE_LAMBDA_REGISTRATION,
  SLA_VIOLATION_CHECKER_LAMBDA_SQS_REGISTRATION,
  API_KEY_AUTHORIZER_V2_LAMBDA_REGISTRATION,
  JWKS_CACHE_REFRESH_LAMBDA_REGISTRATION,
  DELIVERY_INSERT_TRIGGER_EB_LAMBDA_REGISTRATION,
  LOLLIPOP_AUTHORIZER_LAMBDA_REGISTRATION,
  SENDER_DASHBOARD_DATA_INDEXER_REGISTRATION,
  DOWNSTREAM_MONITORING_LAMBDA_REGISTRATION,
  CDC_PREPROC_DATA_QUALITY_FILTER_REGISTRATION,
  LAMBDA_DAILY_EXPORT_DYNAMO_DB_TABLE_LOG_INVOCATION_ERRORS_ALARM_REGISTRATION,
  JWT_AUTHORIZER_LAMBDA_LOG_INVOCATION_ERRORS_ALARM_REGISTRATION,
  // downstream
  EMD_DOWNSTREAM_DETECTION_REGISTRATION,
  EXTERNAL_REGISTRIES_ONE_TRUST_REGISTRATION,
  EXTERNAL_REGISTRIES_IO_REGISTRATION,
  NATIONAL_REGISTRIES_IPA_REGISTRATION,
  NATIONAL_REGISTRIES_ANPR_REGISTRATION,
  NATIONAL_REGISTRIES_INFO_CAMERE_REGISTRATION,
  NATIONAL_REGISTRIES_ADE_REGISTRATION,
  NATIONAL_REGISTRIES_INAD_REGISTRATION,
  ADDRESS_MANAGER_POSTEL_REGISTRATION,
  PERSONAL_DATA_VAULT_SELFCARE_PG_REGISTRATION,
  EXTERNAL_REGISTRIES_SELFCARE_PA_DOWNSTREAM_DETECTION_ALARM_REGISTRATION,
  // log applicativi
  WORKDAY_EXTERNAL_CHANNEL_ALB_REGISTRATION,
  MANDATE_ACCEPTANCE_FAILURE_TECH_REGISTRATION,
  DELAYER_SENDER_LIMIT_JOB_REGISTRATION,
  LOGSAVER_REGISTRATION, // bespoke: nessun builder di famiglia
  SPIDHUB_EXTERNAL_ELB_REGISTRATION, // bespoke: nessun builder di famiglia
  SERVICE_DESK_ALB_ALARM_REGISTRATION,
];
