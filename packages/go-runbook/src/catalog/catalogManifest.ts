/**
 * The catalog: every automatic runbook known to the CLI, the worker and the descriptor exporter.
 *
 * Maintained by hand. To add a runbook, declare its identity in
 * `runbooks/<id>/registration.ts` and add the two lines below: the import and the array entry.
 */
import type { AutomaticRunbookRegistration } from './AutomaticRunbookRegistration.js';

// api gateway
import { ADDRESS_BOOK_IO_REGISTRATION } from './runbooks/pn-address-book-io-IO-ApiGwAlarm/registration.js';
import { DELIVERY_B2B_REGISTRATION } from './runbooks/pn-delivery-B2B-ApiGwAlarm/registration.js';
import { DELIVERY_IO_EXP_REGISTRATION } from './runbooks/pn-delivery-IO_EXP-ApiGwAlarm/registration.js';
import { DELIVERY_PUSH_B2B_REGISTRATION } from './runbooks/pn-delivery-push-B2B-ApiGwAlarm/registration.js';
import { NATIONAL_REGISTRIES_PNPG_REGISTRATION } from './runbooks/pn-national-registries-PNPG-ApiGwAlarm/registration.js';

// lambda
import { IO_AUTHORIZER_LAMBDA_REGISTRATION } from './runbooks/pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/registration.js';
import { TOKEN_EXCHANGE_LAMBDA_REGISTRATION } from './runbooks/pn-tokenExchangeLambda-LogInvocationErrors-Alarm/registration.js';
import { SLA_VIOLATION_CHECKER_LAMBDA_SQS_REGISTRATION } from './runbooks/pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm/registration.js';
import { API_KEY_AUTHORIZER_V2_LAMBDA_REGISTRATION } from './runbooks/pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm/registration.js';
import { JWKS_CACHE_REFRESH_LAMBDA_REGISTRATION } from './runbooks/pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm/registration.js';
import { DELIVERY_INSERT_TRIGGER_EB_LAMBDA_REGISTRATION } from './runbooks/pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm/registration.js';
import { LOLLIPOP_AUTHORIZER_LAMBDA_REGISTRATION } from './runbooks/pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm/registration.js';
import { SENDER_DASHBOARD_DATA_INDEXER_REGISTRATION } from './runbooks/pn-bff-SenderDashboardDataIndexer-LogInvocationErrors-Alarm/registration.js';

// service logs
import { EMD_DOWNSTREAM_DETECTION_REGISTRATION } from './runbooks/emd-downstream-detection-Alarm/registration.js';
import { EXTERNAL_REGISTRIES_ONE_TRUST_REGISTRATION } from './runbooks/pn-external-registries-OneTrust-downstream-detection-Alarm/registration.js';
import { NATIONAL_REGISTRIES_IPA_REGISTRATION } from './runbooks/pn-national-registries-IPA-downstream-detection-Alarm/registration.js';
import { NATIONAL_REGISTRIES_ANPR_REGISTRATION } from './runbooks/pn-national-registries-ANPR-downstream-detection-Alarm/registration.js';
import { NATIONAL_REGISTRIES_INFO_CAMERE_REGISTRATION } from './runbooks/pn-national-registries-InfoCamere-downstream-detection-Alarm/registration.js';
import { NATIONAL_REGISTRIES_ADE_REGISTRATION } from './runbooks/pn-national-registries-AdE-downstream-detection-Alarm/registration.js';
import { NATIONAL_REGISTRIES_INAD_REGISTRATION } from './runbooks/pn-national-registries-INAD-downstream-detection-Alarm/registration.js';
import { ADDRESS_MANAGER_POSTEL_REGISTRATION } from './runbooks/pn-address-manager-POSTEL-downstream-detection-Alarm/registration.js';
import { PERSONAL_DATA_VAULT_SELFCARE_PG_REGISTRATION } from './runbooks/personal-data-vault-SelfcarePG-downstream-detection-Alarm/registration.js';
import { WORKDAY_EXTERNAL_CHANNEL_ALB_REGISTRATION } from './runbooks/workday-pn-external-channel-alb-alarm/registration.js';
import { MANDATE_ACCEPTANCE_FAILURE_TECH_REGISTRATION } from './runbooks/pn-mandate-acceptance-failure-tech-Alarm/registration.js';

// interop kubernetes
import { ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_REGISTRATION } from './runbooks/k8s-interop-be-attribute-registry-readmodel-writer-sql-errors/registration.js';
import { CATALOG_READMODEL_WRITER_SQL_REGISTRATION } from './runbooks/k8s-interop-be-catalog-readmodel-writer-sql-errors/registration.js';
import { BFF_REGISTRATION } from './runbooks/k8s-interop-be-backend-for-frontend-errors/registration.js';
import { NOTIFICATION_USER_LIFECYCLE_REGISTRATION } from './runbooks/k8s-interop-be-notification-user-lifecycle-consumer-errors/registration.js';
import { PUBLIC_CATALOG_REGISTRATION } from './runbooks/k8s-interop-public-catalog-astro-frontend-errors/registration.js';
import { SELFCARE_USERS_UPDATER_REGISTRATION } from './runbooks/k8s-interop-be-selfcare-client-users-updater-errors/registration.js';
import { SELFCARE_ONBOARDING_CONSUMER_REGISTRATION } from './runbooks/k8s-interop-be-selfcare-onboarding-consumer-errors/registration.js';

// interop api gateway
import { SELFCARE_APIGW_REGISTRATION } from './runbooks/interop-selfcare-1.0-apigw-5xx/registration.js';
import { AUTH_SERVER_APIGW_REGISTRATION } from './runbooks/interop-auth-server-apigw-4xx/registration.js';

export const CATALOG_MANIFEST: ReadonlyArray<AutomaticRunbookRegistration> = [
  // api gateway
  ADDRESS_BOOK_IO_REGISTRATION,
  DELIVERY_B2B_REGISTRATION,
  DELIVERY_IO_EXP_REGISTRATION,
  DELIVERY_PUSH_B2B_REGISTRATION,
  NATIONAL_REGISTRIES_PNPG_REGISTRATION,
  // lambda
  IO_AUTHORIZER_LAMBDA_REGISTRATION,
  TOKEN_EXCHANGE_LAMBDA_REGISTRATION,
  SLA_VIOLATION_CHECKER_LAMBDA_SQS_REGISTRATION,
  API_KEY_AUTHORIZER_V2_LAMBDA_REGISTRATION,
  JWKS_CACHE_REFRESH_LAMBDA_REGISTRATION,
  DELIVERY_INSERT_TRIGGER_EB_LAMBDA_REGISTRATION,
  LOLLIPOP_AUTHORIZER_LAMBDA_REGISTRATION,
  SENDER_DASHBOARD_DATA_INDEXER_REGISTRATION,
  // service logs
  EMD_DOWNSTREAM_DETECTION_REGISTRATION,
  EXTERNAL_REGISTRIES_ONE_TRUST_REGISTRATION,
  NATIONAL_REGISTRIES_IPA_REGISTRATION,
  NATIONAL_REGISTRIES_ANPR_REGISTRATION,
  NATIONAL_REGISTRIES_INFO_CAMERE_REGISTRATION,
  NATIONAL_REGISTRIES_ADE_REGISTRATION,
  NATIONAL_REGISTRIES_INAD_REGISTRATION,
  ADDRESS_MANAGER_POSTEL_REGISTRATION,
  PERSONAL_DATA_VAULT_SELFCARE_PG_REGISTRATION,
  WORKDAY_EXTERNAL_CHANNEL_ALB_REGISTRATION,
  MANDATE_ACCEPTANCE_FAILURE_TECH_REGISTRATION,
  // interop kubernetes
  ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_REGISTRATION,
  CATALOG_READMODEL_WRITER_SQL_REGISTRATION,
  BFF_REGISTRATION,
  NOTIFICATION_USER_LIFECYCLE_REGISTRATION,
  PUBLIC_CATALOG_REGISTRATION,
  SELFCARE_USERS_UPDATER_REGISTRATION,
  SELFCARE_ONBOARDING_CONSUMER_REGISTRATION,
  // interop api gateway
  SELFCARE_APIGW_REGISTRATION,
  AUTH_SERVER_APIGW_REGISTRATION,
];
