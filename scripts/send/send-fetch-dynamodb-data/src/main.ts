/**
 * Send Fetch Dynamodb Data - Main Logic Module
 *
 * Reads a list of partition keys from a text file, queries a DynamoDB table
 * for each key (with optional prefix/suffix), and writes all results to a
 * JSON or NDJSON file using streaming writes via GOJSONListExporter.
 */

import { Core } from '@go-automation/go-common';
import { readPkFile } from './libs/PkFileReader.js';
import type { SendFetchDynamodbDataConfig } from './types/index.js';

/**
 * Main script execution function
 *
 * Reads PKs from a text file, queries DynamoDB for each key using the
 * DynamoDBQueryService with optional prefix/suffix, and writes all
 * results to a JSON output file.
 *
 * @param script - The GOScript instance for logging, config, and AWS access
 *
 * @example
 * ```typescript
 * await main(script);
 * ```
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<SendFetchDynamodbDataConfig>();

  // Step 1: Read PKs from input file
  script.logger.section('Reading Input File');
  script.prompt.startSpinner(`Reading PKs from ${config.inputPkfile}...`);

  const inputFilePath = script.paths.resolvePathWithInfo(config.inputPkfile, Core.GOPathType.INPUT);
  const pks = await readPkFile(inputFilePath.path);

  script.prompt.spinnerStop(`Found ${pks.length} PKs to query`);

  // Guard: No PKs to process
  if (pks.length === 0) {
    script.logger.warning('No PKs found in input file');
    return;
  }

  // Step 2: Query DynamoDB for each PK
  script.logger.section('Querying DynamoDB');

  const queryOptions: Core.DynamoDBQueryOptions = {
    tableName: config.tableName,
    keyName: config.tableKey,
    ...(config.keyPrefix !== undefined && { prefix: config.keyPrefix }),
    ...(config.keySuffix !== undefined && { suffix: config.keySuffix }),
  };

  script.logger.info(`Table: ${config.tableName}`);
  script.logger.info(`Key: ${config.tableKey}`);
  if (config.keyPrefix) {
    script.logger.info(`Prefix: ${config.keyPrefix}`);
  }
  if (config.keySuffix) {
    script.logger.info(`Suffix: ${config.keySuffix}`);
  }

  script.prompt.startSpinner(`Querying ${pks.length} PKs...`);

  const queryService = new Core.DynamoDBQueryService(script.aws.dynamoDB);

  let lastProgressUpdate = 0;
  const results = await queryService.queryMultipleByPartitionKey(pks, queryOptions, (current, total) => {
    if (current - lastProgressUpdate >= 10 || current === total) {
      script.prompt.updateSpinner(`Processed ${current}/${total} PKs...`);
      lastProgressUpdate = current;
    }
  });

  const totalItems = results.reduce((sum, r) => sum + r.count, 0);
  script.prompt.spinnerStop(`Queried ${results.length} PKs, found ${totalItems} items`);

  // Step 3: Write results to output file using streaming exporter
  script.logger.section('Writing Results');

  const isNdjson = config.outputFormat === 'ndjson';
  const formatLabel = isNdjson ? 'NDJSON' : 'JSON';

  script.prompt.startSpinner(`Writing ${formatLabel} results to ${config.outputFile}...`);

  const outputFilePath = script.paths.resolvePath(config.outputFile, Core.GOPathType.OUTPUT);

  const exporterOptions: Core.GOJSONListExporterOptions = {
    outputPath: outputFilePath,
    pretty: !isNdjson,
    indent: 4,
    ...(isNdjson && { jsonl: true }),
  };

  const exporter = new Core.GOJSONListExporter(exporterOptions);
  // Safe: DynamoDBQueryResult is a plain object with string keys (keyValue, fullKey, items, count)
  const mutableResults = [...results] as unknown as Record<string, unknown>[];
  await exporter.export(mutableResults);

  script.prompt.spinnerStop(`${formatLabel} results written to ${config.outputFile}`);

  // Display summary (single-pass count)
  script.logger.section('Summary');
  let withDataCount = 0;
  for (const r of results) {
    if (r.count > 0) {
      withDataCount++;
    }
  }

  script.logger.info(`Total PKs queried: ${results.length}`);
  script.logger.info(`PKs with data: ${withDataCount}`);
  script.logger.info(`PKs with no results: ${results.length - withDataCount}`);
  script.logger.info(`Total items retrieved: ${totalItems}`);
  script.logger.info(`Output format: ${formatLabel}`);

  await script.logger.reset();
}
