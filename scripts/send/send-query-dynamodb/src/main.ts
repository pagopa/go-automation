/**
 * SEND Query DynamoDB - Main Logic Module
 *
 * Reads a list of partition keys from a file (TXT, JSONL, or CSV) or CLI,
 * queries a DynamoDB table for each key (with optional prefix/suffix),
 * and writes all results to a file (JSON, NDJSON, CSV, or Text).
 * Also prints a clean JSON mapping of results to the console.
 */

import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { Core } from '@go-automation/go-common';

import { loadPartitionKeys } from './libs/loadPartitionKeys.js';
import { getSchemaInfo, validateSchemaConfig } from './libs/getSchemaInfo.js';
import { queryAllKeys } from './libs/queryAllKeys.js';
import { writeResultsToFile } from './libs/writeResultsToFile.js';
import { withRetry } from './libs/withRetry.js';
import { formatConsoleJson } from './libs/OutputFormatter.js';
import { displayDryRunPreview } from './libs/displayDryRunPreview.js';
import type { SendQueryDynamodbConfig } from './types/index.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance for logging, config, and AWS access
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<SendQueryDynamodbConfig>();

  // Step 1: Import PKs
  script.logger.section('Importing Partition Keys');
  const pks = await loadPartitionKeys(config, script);

  if (pks.length === 0) {
    script.logger.warning('No PKs to process');
    return;
  }

  // Step 2: Schema check and validation
  script.logger.section('Checking Table Schema');
  script.prompt.startSpinner(`Describing table ${config.tableName}...`);
  const tableDesc = await withRetry(async () => {
    const res = await script.aws.dynamoDB.send(new DescribeTableCommand({ TableName: config.tableName }));
    return res.Table;
  });
  script.prompt.spinnerStop(`Table ${config.tableName} is ${tableDesc?.TableStatus}`);

  if (!tableDesc) {
    throw new Error(`Could not retrieve description for table ${config.tableName}`);
  }

  const schema = getSchemaInfo(tableDesc, config.indexName);
  validateSchemaConfig(schema, config.tableKey, config.tableSortKey, config.tableSortValue);

  script.logger.info(`Target: ${config.indexName ? `Index ${config.indexName}` : 'Base Table'}`);
  script.logger.info(`Partition Key: ${schema.partitionKey}`);
  if (schema.sortKey) {
    script.logger.info(`Sort Key: ${schema.sortKey}`);
  }

  // Step 3: Dry-run preview
  if (config.dryRun) {
    displayDryRunPreview(script, config, pks);
    return;
  }

  // Step 4: Query DynamoDB
  script.logger.section('Querying DynamoDB');
  const { resultMap, totalItems } = await queryAllKeys(pks, config, script);

  // Step 5: Save default JSON results
  script.logger.section('Saving Results');
  const defaultOutputPath = script.paths.resolvePath('results.json', Core.GOPathType.OUTPUT);
  script.prompt.startSpinner('Saving default JSON results mapping...');
  const defaultExporter = new Core.GOJSONFileExporter({ outputPath: defaultOutputPath, pretty: true, indent: 2 });
  await defaultExporter.export(resultMap);
  script.prompt.spinnerStop(`Default results mapping saved to: ${defaultOutputPath}`);

  // Step 6: Write to custom output file if requested
  if (config.outputFile) {
    script.logger.section('Writing Custom Output');
    const outputFilePath = script.paths.resolvePath(config.outputFile, Core.GOPathType.OUTPUT);
    script.prompt.startSpinner(`Exporting custom results to ${config.outputFile} (${config.outputFormat})...`);
    await writeResultsToFile(outputFilePath, resultMap, config.outputFormat, config.tableKey);
    script.prompt.spinnerStop(`Custom results successfully written to ${config.outputFile}`);
  }

  // Step 7: Summary
  script.logger.section('Summary');
  const withData = Object.values(resultMap).filter((items) => items.length > 0).length;
  script.logger.info(`Total PKs queried: ${pks.length}`);
  script.logger.info(`PKs with results: ${withData}`);
  script.logger.info(`Total items retrieved: ${totalItems}`);

  // Step 8: Console Output (mandatory JSON mapping)
  script.logger.section('Result Mapping');
  console.log(formatConsoleJson(resultMap));
}
