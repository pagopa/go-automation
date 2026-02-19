/**
 * Send Fetch Dynamodb Data - Main Logic Module
 *
 * Reads a list of partition keys from a file (TXT, JSONL, or CSV), queries
 * a DynamoDB table for each key (with optional prefix/suffix), and writes
 * all results to a JSON or NDJSON file using streaming writes.
 */

import { Core } from '@go-automation/go-common';

import { importPks } from './libs/PkImporter.js';
import type { SendFetchDynamodbDataConfig } from './types/index.js';

/**
 * Main script execution function
 *
 * Reads PKs from an input file (supports TXT, JSONL, CSV formats),
 * queries DynamoDB for each key using the DynamoDBQueryService with
 * optional prefix/suffix, and writes all results to a JSON or NDJSON file.
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

  // Step 1: Import PKs from input file
  script.logger.section('Reading Input File');
  const formatLabel = config.inputFormat.toUpperCase();
  script.prompt.startSpinner(`Reading PKs from ${config.inputFile} (${formatLabel})...`);

  const inputFilePath = script.paths.resolvePathWithInfo(config.inputFile, Core.GOPathType.INPUT);
  const pks = await importPks(inputFilePath.path, {
    format: config.inputFormat,
    csvColumn: config.csvColumn,
    csvDelimiter: config.csvDelimiter,
  });

  script.prompt.spinnerStop(`Found ${pks.length} unique PKs to query (format: ${formatLabel})`);

  // Guard: No PKs to process
  if (pks.length === 0) {
    script.logger.warning('No PKs found in input file');
    return;
  }

  // Dry-run: preview PKs with prefix/suffix and exit
  if (config.dryRun) {
    script.logger.section('Dry Run Preview');
    script.logger.info(`Table: ${config.tableName}`);
    script.logger.info(`Key: ${config.tableKey}`);
    script.logger.info(`Total PKs: ${pks.length}`);

    const prefix = config.keyPrefix ?? '';
    const suffix = config.keySuffix ?? '';
    const previewLimit = 20;
    const previewCount = Math.min(pks.length, previewLimit);

    for (let i = 0; i < previewCount; i++) {
      script.logger.info(`  ${prefix}${pks[i]!}${suffix}`);
    }
    if (pks.length > previewLimit) {
      script.logger.info(`  ... and ${pks.length - previewLimit} more`);
    }

    await script.logger.reset();
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
  const outputFormatLabel = isNdjson ? 'NDJSON' : 'JSON';

  script.prompt.startSpinner(`Writing ${outputFormatLabel} results to ${config.outputFile}...`);

  const outputFilePath = script.paths.resolvePath(config.outputFile, Core.GOPathType.OUTPUT);

  const exporter = new Core.GOJSONListExporter<Core.DynamoDBQueryResult>({
    outputPath: outputFilePath,
    pretty: !isNdjson,
    indent: 4,
    ...(isNdjson && { jsonl: true }),
  });
  await exporter.export(results);

  script.prompt.spinnerStop(`${outputFormatLabel} results written to ${config.outputFile}`);

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
  script.logger.info(`Input format: ${formatLabel}`);
  script.logger.info(`Output format: ${outputFormatLabel}`);

  await script.logger.reset();
}
