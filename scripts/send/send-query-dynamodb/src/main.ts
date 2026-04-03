/**
 * SEND Query DynamoDB - Main Logic Module
 *
 * Reads a list of partition keys from a file (TXT, JSONL, or CSV) or CLI,
 * queries a DynamoDB table for each key (with optional prefix/suffix),
 * and writes all results to a file (JSON, NDJSON, CSV, or Text).
 * Also prints a clean JSON mapping of results to the console.
 */

import * as fs from 'fs';
import * as path from 'path';
import { QueryCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import type { QueryCommandInput, AttributeValue, TableDescription } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Core } from '@go-automation/go-common';

import { importPks } from './libs/PkImporter.js';
import { formatConsoleJson, formatForCsv, formatForText } from './libs/OutputFormatter.js';
import type { SendQueryDynamodbConfig, OutputFormat } from './types/index.js';

/**
 * Result mapping: PK -> array of items
 */
type ResultMap = Record<string, unknown[]>;

/**
 * Main script execution function
 *
 * @param script - The GOScript instance for logging, config, and AWS access
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<SendQueryDynamodbConfig>();

  // Step 1: Import PKs
  script.logger.section('Importing Partition Keys');
  let pks: string[];

  if (config.inputPks) {
    pks = config.inputPks.map((pk) => pk.trim()).filter((pk) => pk !== '');
    script.logger.info(`Found ${pks.length} PKs from command line`);
  } else if (config.inputFile) {
    // Path resolution: try absolute, then relative to INIT_CWD (where pnpm was run),
    // then relative to CWD (script dir), then project root, then fallback to script inputs dir
    let finalInputPath: string;

    if (path.isAbsolute(config.inputFile)) {
      finalInputPath = config.inputFile;
    } else {
      const initCwd = process.env['INIT_CWD'];
      const pathsToTry = [
        ...(initCwd ? [path.resolve(initCwd, config.inputFile)] : []),
        path.resolve(process.cwd(), config.inputFile),
        path.resolve(script.paths.getBaseDir(), config.inputFile),
        script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT),
      ];

      finalInputPath = pathsToTry.find((p) => fs.existsSync(p)) ?? (pathsToTry[pathsToTry.length - 1] as string);
    }

    if (!fs.existsSync(finalInputPath)) {
      throw new Error(`Input file not found: ${config.inputFile} (tried: ${finalInputPath})`);
    }

    script.prompt.startSpinner(`Reading PKs from ${finalInputPath}...`);
    const imported = await importPks(finalInputPath, {
      format: config.inputFormat,
      csvColumn: config.csvColumn,
      csvDelimiter: config.csvDelimiter,
    });
    pks = [...imported];
    script.prompt.spinnerStop(`Found ${pks.length} unique PKs from file`);
  } else {
    throw new Error('Either input.pks or input.file must be provided');
  }

  // Deduplicate PKs
  pks = [...new Set(pks)];

  if (pks.length === 0) {
    script.logger.warning('No PKs to process');
    return;
  }

  // Step 2: Preliminary Schema Check
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

  const { partitionKey, sortKey } = getSchemaInfo(tableDesc, config.indexName);

  script.logger.info(`Target: ${config.indexName ? `Index ${config.indexName}` : 'Base Table'}`);
  script.logger.info(`Partition Key: ${partitionKey}`);
  if (sortKey) {
    script.logger.info(`Sort Key: ${sortKey}`);
  }

  // Validation
  if (config.tableKey !== partitionKey) {
    throw new Error(`Configured table.key (${config.tableKey}) does not match schema partition key (${partitionKey})`);
  }

  if (sortKey && (!config.tableSortKey || !config.tableSortValue)) {
    throw new Error(`Table/Index requires a sort key (${sortKey}), but table.sort-key or table.sort-value is missing`);
  }

  if (config.tableSortKey && config.tableSortKey !== sortKey) {
    throw new Error(
      `Configured table.sort-key (${config.tableSortKey}) does not match schema sort key (${sortKey ?? 'none'})`,
    );
  }

  // Dry-run preview
  if (config.dryRun) {
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
    pks.slice(0, previewCount).forEach((pk) => script.logger.info(`  Query PK: ${prefix}${pk}${suffix}`));
    if (pks.length > previewCount) script.logger.info(`  ... and ${pks.length - previewCount} more`);
    return;
  }

  // Step 3: Query DynamoDB
  script.logger.section('Querying DynamoDB');
  const resultMap: ResultMap = {};
  const isRaw = config.outputFormat === 'dynamo-json';
  const projection = config.outputAttributes
    ? config.outputAttributes
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a !== '')
    : undefined;

  script.prompt.startSpinner(`Querying ${pks.length} PKs...`);

  let totalItems = 0;
  const chunkSize = 10;

  for (let i = 0; i < pks.length; i += chunkSize) {
    const chunk = pks.slice(i, i + chunkSize);

    await Promise.all(
      chunk.map(async (pk) => {
        const fullKey = `${config.keyPrefix ?? ''}${pk}${config.keySuffix ?? ''}`;
        const items: unknown[] = [];
        let exclusiveStartKey: Record<string, AttributeValue> | undefined;

        do {
          const keyCondition = config.tableSortKey ? '#pk = :pkVal AND #sk = :skVal' : '#pk = :pkVal';

          const expressionNames: Record<string, string> = { '#pk': config.tableKey };
          const expressionValues: Record<string, AttributeValue> = { ':pkVal': { S: fullKey } };

          if (config.tableSortKey && config.tableSortValue) {
            expressionNames['#sk'] = config.tableSortKey;
            expressionValues[':skVal'] = { S: config.tableSortValue };
          }

          if (projection) {
            projection.forEach((attr, idx) => {
              expressionNames[`#attr${idx}`] = attr;
            });
          }

          const input: QueryCommandInput = {
            TableName: config.tableName,
            IndexName: config.indexName,
            KeyConditionExpression: keyCondition,
            ExpressionAttributeNames: expressionNames,
            ExpressionAttributeValues: expressionValues,
            ExclusiveStartKey: exclusiveStartKey,
            ...(projection && {
              ProjectionExpression: projection.map((_, idx) => `#attr${idx}`).join(', '),
            }),
          };

          const response = await withRetry(async () => script.aws.dynamoDB.send(new QueryCommand(input)));

          if (response.Items) {
            for (const item of response.Items) {
              items.push(isRaw ? item : unmarshall(item));
            }
          }
          exclusiveStartKey = response.LastEvaluatedKey;
        } while (exclusiveStartKey !== undefined);

        resultMap[pk] = items;
        totalItems += items.length;
      }),
    );

    script.prompt.updateSpinner(`Processed ${Math.min(i + chunkSize, pks.length)}/${pks.length} PKs...`);
  }

  script.prompt.spinnerStop(`Querying completed. Found ${totalItems} items across ${pks.length} PKs.`);

  // Step 4: Save default JSON results to execution output directory
  script.logger.section('Saving Results');
  const defaultOutputPath = script.paths.resolvePath('results.json', Core.GOPathType.OUTPUT);
  script.prompt.startSpinner('Saving default JSON results mapping...');
  await fs.promises.writeFile(defaultOutputPath, formatConsoleJson(resultMap), 'utf8');
  script.prompt.spinnerStop(`Default results mapping saved to: ${defaultOutputPath}`);

  // Step 5: Write to custom output file if requested
  if (config.outputFile) {
    script.logger.section('Writing Custom Output');
    const outputFilePath = script.paths.resolvePath(config.outputFile, Core.GOPathType.OUTPUT);
    script.prompt.startSpinner(`Exporting custom results to ${config.outputFile} (${config.outputFormat})...`);

    await writeResultsToFile(outputFilePath, resultMap, config.outputFormat, config.tableKey);
    script.prompt.spinnerStop(`Custom results successfully written to ${config.outputFile}`);
  }

  // Step 6: Summary
  script.logger.section('Summary');
  const withData = Object.values(resultMap).filter((items) => items.length > 0).length;
  script.logger.info(`Total PKs queried: ${pks.length}`);
  script.logger.info(`PKs with results: ${withData}`);
  script.logger.info(`Total items retrieved: ${totalItems}`);

  // Step 6: Console Output (MANDATORY JSON mapping)
  script.logger.section('Result Mapping');
  console.log(formatConsoleJson(resultMap));
}

/**
 * Extracts schema info (PK and optionally SK) for the table or specified index
 */
function getSchemaInfo(
  table: TableDescription,
  indexName?: string,
): { partitionKey: string; sortKey: string | undefined } {
  let keySchema = table.KeySchema;

  if (indexName) {
    const gsi = table.GlobalSecondaryIndexes?.find((i) => i.IndexName === indexName);
    const lsi = table.LocalSecondaryIndexes?.find((i) => i.IndexName === indexName);
    const index = gsi ?? lsi;

    if (!index) {
      throw new Error(`Index ${indexName} not found in table description`);
    }
    keySchema = index.KeySchema;
  }

  if (!keySchema) {
    throw new Error(`No key schema found for ${indexName ? `index ${indexName}` : 'table'}`);
  }

  const pk = keySchema.find((k) => k.KeyType === 'HASH')?.AttributeName;
  const sk = keySchema.find((k) => k.KeyType === 'RANGE')?.AttributeName;

  if (!pk) {
    throw new Error(`Could not find partition key in ${indexName ? `index ${indexName}` : 'table'} schema`);
  }

  return { partitionKey: pk, sortKey: sk };
}

/**
 * Retry helper with exponential backoff
 */
async function withRetry<T>(operation: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      const retryableNames = [
        'ProvisionedThroughputExceededException',
        'LimitExceededException',
        'InternalServerError',
        'ServiceUnavailable',
        'RequestTimeoutException',
      ];

      const errorObj = error as Record<string, unknown>;
      const errorName = typeof errorObj['name'] === 'string' ? errorObj['name'] : '';
      const errorCode = typeof errorObj['code'] === 'string' ? errorObj['code'] : '';

      if (retryableNames.includes(errorName) || errorCode === 'ECONNRESET' || errorCode === 'ETIMEDOUT') {
        const delay = Math.pow(2, attempt) * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Writes results to file in specified format
 */
async function writeResultsToFile(
  path: string,
  resultMap: ResultMap,
  format: OutputFormat,
  pkKey: string,
): Promise<void> {
  const items = Object.values(resultMap).flat();

  switch (format) {
    case 'json':
    case 'dynamo-json':
    case 'ndjson': {
      const isNdjson = format === 'ndjson';
      const exporter = new Core.GOJSONListExporter<unknown>({
        outputPath: path,
        pretty: !isNdjson,
        indent: 4,
        jsonl: isNdjson,
      });
      await exporter.export(items);
      break;
    }
    case 'csv': {
      const csvData = formatForCsv(resultMap, pkKey);
      const exporter = new Core.GOCSVListExporter<Record<string, unknown>>({
        outputPath: path,
        includeHeader: true,
      });
      await exporter.export(csvData);
      break;
    }
    case 'text': {
      const text = formatForText(resultMap);
      await fs.promises.writeFile(path, text, 'utf8');
      break;
    }
    default:
      throw new Error(`Unsupported output format: ${format as string}`);
  }
}
