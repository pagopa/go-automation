/**
 * Single import boundary towards the other monorepo packages.
 * Bins are root-level tools executed with tsx and are not workspace packages,
 * so they reach sibling package sources by relative path; keeping every
 * cross-package import here means an internal refactor of those packages
 * touches exactly one file in this bin.
 */
export type {
  AutomaticRunbookCatalogV1,
  AutomaticRunbookDescriptorV1,
} from '../../../packages/go-execute-runbook-contracts/src/index.js';
export {
  AUTOMATIC_RUNBOOK_CATALOG_KEY,
  buildAutomaticRunbookCatalog,
  canonicalizeJson,
  validateAutomaticRunbookCatalog,
} from '../../../packages/go-execute-runbook-contracts/src/index.js';
export {
  accountIdFromArn,
  buildAutomaticRunbookCatalogBucketName,
  EXECUTE_RUNBOOK_LAMBDA_NAME,
  EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION,
} from '../../../infra/watchtower-alarm-analysis/src/config/constants.js';
export { loadExecuteRunbookDeploymentConfig } from '../../../infra/watchtower-alarm-analysis/src/config/DeploymentConfig.js';
