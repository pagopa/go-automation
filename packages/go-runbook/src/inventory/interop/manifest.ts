/**
 * INTEROP runbooks of the inventory, by family (`./<family>/<alarm>/`).
 *
 * Maintained by hand or by `pnpm create:runbook`: to add a runbook, declare its
 * identity in `<family>/<alarm>/registration.ts` and add the import and the
 * array entry in the block of its family. Collisions of keys and alarm names
 * are checked globally by the registry (`../registry/`), across products.
 */
import type { RunbookRegistration } from '../../toolkits/interop/index.js';

// API Gateway
import { SELFCARE_APIGW_REGISTRATION } from './apigw/interop-selfcare-1.0-apigw-5xx/registration.js';
import { AUTH_SERVER_APIGW_REGISTRATION } from './apigw/interop-auth-server-apigw-4xx/registration.js';
import { AUTH_SERVER_5XX_APIGW_REGISTRATION } from './apigw/interop-auth-server-apigw-5xx/registration.js';
import { INTEROP_API_V2_5XX_APIGW_REGISTRATION } from './apigw/interop-api-v2-apigw-5xx/registration.js';
import { INTEROP_ATT_ESERVICES_4XX_REGISTRATION } from './apigw/interop-att-eservices-att-apigw-4xx/registration.js';
// Kubernetes
import { AGREEMENT_READMODEL_WRITER_SQL_REGISTRATION } from './k8s/k8s-interop-be-agreement-readmodel-writer-sql-errors/registration.js';
import { AUDIT_SIGNER_REGISTRATION } from './k8s/k8s-interop-be-audit-signer-errors/registration.js';
import { ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_REGISTRATION } from './k8s/k8s-interop-be-async-token-generation-readmodel-checker-errors/registration.js';
import { AUTHORIZATION_PROCESS_REGISTRATION } from './k8s/k8s-interop-be-authorization-process-errors/registration.js';
import { ISTAT_IMPORTER_REGISTRATION } from './k8s/k8s-interop-be-istat-certified-attributes-importer-errors/registration.js';
import { ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_REGISTRATION } from './k8s/k8s-interop-be-attribute-registry-readmodel-writer-sql-errors/registration.js';
import { CATALOG_READMODEL_WRITER_SQL_REGISTRATION } from './k8s/k8s-interop-be-catalog-readmodel-writer-sql-errors/registration.js';
import { CATALOG_PLATFORMSTATE_WRITER_REGISTRATION } from './k8s/k8s-interop-be-catalog-platformstate-writer-errors/registration.js';
import { TENANT_READMODEL_WRITER_SQL_REGISTRATION } from './k8s/k8s-interop-be-tenant-readmodel-writer-sql-errors/registration.js';
import { DELEGATION_ITEMS_ARCHIVER_REGISTRATION } from './k8s/k8s-interop-be-delegation-items-archiver-errors/registration.js';
import { DELEGATION_OUTBOUND_WRITER_REGISTRATION } from './k8s/k8s-interop-be-delegation-outbound-writer-errors/registration.js';
import { DELEGATION_READMODEL_WRITER_SQL_REGISTRATION } from './k8s/k8s-interop-be-delegation-readmodel-writer-sql-errors/registration.js';
import { ESERVICE_TEMPLATE_INSTANCES_UPDATER_REGISTRATION } from './k8s/k8s-interop-be-eservice-template-instances-updater-errors/registration.js';
import { ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_REGISTRATION } from './k8s/k8s-interop-be-eservice-template-readmodel-writer-sql-errors/registration.js';
import { COMPUTE_AGREEMENTS_CONSUMER_REGISTRATION } from './k8s/k8s-interop-be-compute-agreements-consumer-errors/registration.js';
import { M2M_EVENT_DISPATCHER_REGISTRATION } from './k8s/k8s-interop-be-m2m-event-dispatcher-errors-prod/registration.js';
import { BFF_REGISTRATION } from './k8s/k8s-interop-be-backend-for-frontend-errors/registration.js';
import { NOTIFIER_REGISTRATION } from './k8s/k8s-interop-be-notifier-errors/registration.js';
import { NOTIFICATION_USER_LIFECYCLE_REGISTRATION } from './k8s/k8s-interop-be-notification-user-lifecycle-consumer-errors/registration.js';
import { IN_APP_NOTIFICATION_DISPATCHER_REGISTRATION } from './k8s/k8s-interop-be-in-app-notification-dispatcher-errors/registration.js';
import { PURPOSE_OUTBOUND_WRITER_REGISTRATION } from './k8s/k8s-interop-be-purpose-outbound-writer-errors/registration.js';
import { NOTIFICATION_SCHEDULER_REGISTRATION } from './k8s/k8s-interop-be-scheduled-notification-scheduler-errors/registration.js';
import { PUBLIC_CATALOG_REGISTRATION } from './k8s/k8s-interop-public-catalog-astro-frontend-errors/registration.js';
import { PUBLIC_CATALOG_STRAPI_REGISTRATION } from './k8s/k8s-interop-public-catalog-strapi-errors/registration.js';
import { SELFCARE_USERS_UPDATER_REGISTRATION } from './k8s/k8s-interop-be-selfcare-client-users-updater-errors/registration.js';
import { SELFCARE_ONBOARDING_CONSUMER_REGISTRATION } from './k8s/k8s-interop-be-selfcare-onboarding-consumer-errors/registration.js';
import { K8S_INTEROP_BE_ONE_TRUST_NOTICES_ERRORS_PROD_REGISTRATION } from './k8s/k8s-interop-be-one-trust-notices-errors-prod/registration.js';
import { K8S_INTEROP_BE_SIGNED_OBJECTS_PERSISTER_ERRORS_PROD_REGISTRATION } from './k8s/k8s-interop-be-signed-objects-persister-errors-prod/registration.js';
import { K8S_INTEROP_BE_TENANT_KIND_HISTORY_CONSUMER_ERRORS_PROD_REGISTRATION } from './k8s/k8s-interop-be-tenant-kind-history-consumer-errors-prod/registration.js';

export const INTEROP_MANIFEST: ReadonlyArray<RunbookRegistration> = [
  // API Gateway
  SELFCARE_APIGW_REGISTRATION,
  AUTH_SERVER_APIGW_REGISTRATION,
  AUTH_SERVER_5XX_APIGW_REGISTRATION,
  INTEROP_API_V2_5XX_APIGW_REGISTRATION,
  INTEROP_ATT_ESERVICES_4XX_REGISTRATION, // bespoke: nessun builder di famiglia
  // Kubernetes
  AGREEMENT_READMODEL_WRITER_SQL_REGISTRATION,
  AUDIT_SIGNER_REGISTRATION,
  ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_REGISTRATION,
  AUTHORIZATION_PROCESS_REGISTRATION,
  ISTAT_IMPORTER_REGISTRATION,
  ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_REGISTRATION,
  CATALOG_READMODEL_WRITER_SQL_REGISTRATION,
  CATALOG_PLATFORMSTATE_WRITER_REGISTRATION,
  TENANT_READMODEL_WRITER_SQL_REGISTRATION,
  DELEGATION_ITEMS_ARCHIVER_REGISTRATION,
  DELEGATION_OUTBOUND_WRITER_REGISTRATION,
  DELEGATION_READMODEL_WRITER_SQL_REGISTRATION,
  ESERVICE_TEMPLATE_INSTANCES_UPDATER_REGISTRATION,
  ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_REGISTRATION,
  COMPUTE_AGREEMENTS_CONSUMER_REGISTRATION,
  M2M_EVENT_DISPATCHER_REGISTRATION,
  BFF_REGISTRATION,
  NOTIFIER_REGISTRATION,
  NOTIFICATION_USER_LIFECYCLE_REGISTRATION,
  IN_APP_NOTIFICATION_DISPATCHER_REGISTRATION,
  PURPOSE_OUTBOUND_WRITER_REGISTRATION,
  NOTIFICATION_SCHEDULER_REGISTRATION,
  PUBLIC_CATALOG_REGISTRATION,
  PUBLIC_CATALOG_STRAPI_REGISTRATION,
  SELFCARE_USERS_UPDATER_REGISTRATION,
  SELFCARE_ONBOARDING_CONSUMER_REGISTRATION,
  K8S_INTEROP_BE_ONE_TRUST_NOTICES_ERRORS_PROD_REGISTRATION,
  K8S_INTEROP_BE_SIGNED_OBJECTS_PERSISTER_ERRORS_PROD_REGISTRATION,
  K8S_INTEROP_BE_TENANT_KIND_HISTORY_CONSUMER_ERRORS_PROD_REGISTRATION,
];
