/**
 * Loads and deduplicates partition keys from CLI input or file.
 */

import { Core } from '@go-automation/go-common';

import { importPks } from './PkImporter.js';
import type { SendQueryDynamodbConfig } from '../types/index.js';

/**
 * Loads partition keys from the configured source (CLI args or file).
 * Returns a deduplicated array.
 *
 * @param config - Script configuration
 * @param script - GOScript instance for path resolution, logging, and spinner
 * @returns Deduplicated array of partition key strings
 * @throws If neither inputPks nor inputFile is configured
 */
export async function loadPartitionKeys(config: SendQueryDynamodbConfig, script: Core.GOScript): Promise<string[]> {
  let pks: string[];

  if (config.inputPks) {
    pks = config.inputPks.map((pk) => pk.trim()).filter((pk) => pk !== '');
    script.logger.info(`Found ${pks.length} PKs from command line`);
  } else if (config.inputFile) {
    const inputPathInfo = script.paths.resolvePathWithInfo(config.inputFile, Core.GOPathType.INPUT);

    script.prompt.startSpinner(`Reading PKs from ${inputPathInfo.path}...`);
    const imported = await importPks(inputPathInfo.path, {
      format: config.inputFormat,
      csvColumn: config.csvColumn,
      csvDelimiter: config.csvDelimiter,
    });
    pks = [...imported];
    script.prompt.spinnerStop(`Found ${pks.length} unique PKs from file`);
  } else {
    throw new Error('Either input.pks or input.file must be provided');
  }

  return [...new Set(pks)];
}
