/**
 * Displays a dry-run preview of the queries that would be executed.
 */

import { Core } from '@go-automation/go-common';

import type { AwsQueryDynamodbConfig } from '../types/index.js';

/**
 * Displays a dry-run preview of the queries that would be executed.
 *
 * @param script - GOScript instance for logging
 * @param config - Script configuration
 * @param pks - Partition keys to preview
 */
export function displayDryRunPreview(
  script: Core.GOScript,
  config: AwsQueryDynamodbConfig,
  pks: ReadonlyArray<string>,
): void {
  script.logger.section('Dry Run Preview');
  script.logger.info(`Table: ${config.tableName}`);
  if (config.indexName) script.logger.info(`Index: ${config.indexName}`);
  script.logger.info(`Partition Key: ${config.tableKey} = [prefix]PK[suffix]`);
  if (config.tableSortKey) {
    script.logger.info(`Sort Key: ${config.tableSortKey} = ${config.tableSortValue}`);
  }

  const prefix = config.keyPrefix ?? '';
  const suffix = config.keySuffix ?? '';
  const previewCount = Math.min(pks.length, 10);

  for (const pk of pks.slice(0, previewCount)) {
    script.logger.info(`  Query PK: ${prefix}${pk}${suffix}`);
  }

  if (pks.length > previewCount) {
    script.logger.info(`  ... and ${pks.length - previewCount} more`);
  }
}
