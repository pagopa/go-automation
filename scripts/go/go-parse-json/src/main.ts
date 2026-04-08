import * as path from 'path';
import type { Readable } from 'stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import type { FilterLogEventsCommandOutput, FilteredLogEvent } from '@aws-sdk/client-cloudwatch-logs';
import { Core } from '@go-automation/go-common';
import type { GoParseJsonConfig } from './types/GoParseJsonConfig.js';
import { exportValues } from './libs/createExporter.js';

/**
 * Helper to check if an object matches a simple key=value filter
 */
function matchesFilter(item: unknown, filter: string | undefined): boolean {
  if (!filter) return true;
  const [key, expectedValue] = filter.split('=');
  if (!key || expectedValue === undefined) return true;

  const extractor = new Core.GOJSONFieldExtractor({ parseEmbeddedJson: true });
  const actualValue = extractor.extract(item, key.trim());
  return String(actualValue) === expectedValue.trim();
}

export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoParseJsonConfig>();
  const logger = script.logger;

  const outputFormat = config.outputFormat as Core.GOExportFormat;
  const fieldNames = [...config.field];

  let finalInputPath: string;

  // Extension 3: Handle AWS Sources (S3 and CloudWatch Logs)
  if (config.inputFile.startsWith('s3://')) {
    const { bucket, key } = parseS3Uri(config.inputFile);
    finalInputPath = path.join(script.paths.getExecutionOutputDir(), `s3_input_${Date.now()}.json`);
    logger.info(`Downloading S3 object: ${config.inputFile} ...`);
    const response: GetObjectCommandOutput = await script.aws.s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const stream = response.Body as Readable;
    if (!stream) {
      throw new Error(`S3 object ${config.inputFile} has no body`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array);
    }
    const content = Buffer.concat(chunks).toString('utf-8');
    const exporter = new Core.GOFileListExporter({ outputPath: finalInputPath });
    await exporter.export([content]);
  } else if (config.inputFile.startsWith('cwl:')) {
    const logGroup = config.inputFile.replace('cwl:', '');
    finalInputPath = path.join(script.paths.getExecutionOutputDir(), `cwl_input_${Date.now()}.jsonl`);
    logger.info(`Fetching CloudWatch Logs from group: ${logGroup} ...`);
    const startTime = config.startTime ? new Date(config.startTime).getTime() : undefined;
    const endTime = config.endTime ? new Date(config.endTime).getTime() : undefined;

    const events: FilterLogEventsCommandOutput = await script.aws.cloudWatchLogs.send(
      new FilterLogEventsCommand({
        logGroupName: logGroup,
        startTime,
        endTime,
        limit: 1000, // Batch limit for example
      }),
    );

    const logMessages = (events.events ?? [])
      .map((e: FilteredLogEvent) => e.message)
      .filter((m: string | undefined): m is string => m !== undefined);

    const exporter = new Core.GOFileListExporter({ outputPath: finalInputPath });
    await exporter.export(logMessages);
  } else {
    finalInputPath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);
  }

  const extractor = new Core.GOJSONFieldExtractor({ parseEmbeddedJson: true });
  const importer = new Core.GOJSONListImporter<Record<string, unknown> | undefined>({
    jsonl: 'auto',
    skipInvalidItems: true,
    jsonPath: config.jsonPath ?? undefined,
    rowTransformer: (item: unknown) => {
      // Extension 2: Filtering
      const filterStr = config.filter?.join(',');
      if (!matchesFilter(item, filterStr)) {
        return undefined;
      }

      // Extension 1: Multi-field extraction
      const result: Record<string, unknown> = {};
      let hasAnyValue = false;

      for (const field of fieldNames) {
        const val = extractor.extract(item, field);
        if (val !== undefined) {
          result[field] = val;
          hasAnyValue = true;
        }
      }

      return hasAnyValue ? result : undefined;
    },
  } as Core.GOJSONListImporterOptions<unknown, Record<string, unknown> | undefined>);

  importer.on('import:error', (event) => {
    logger.warning(`Errore durante l'importazione: ${event.message}`);
  });

  const dataList: Record<string, unknown>[] = [];
  const uniqueKeys = new Set<string>();

  for await (const row of importer.importStream(finalInputPath)) {
    if (row !== undefined) {
      // Deduplication based on the entire row content
      const key = JSON.stringify(row);
      if (!uniqueKeys.has(key)) {
        uniqueKeys.add(key);
        dataList.push(row);
      }
    }
  }

  const extension = Core.GO_EXPORT_FORMAT_EXTENSIONS[outputFormat];
  const outputPath = script.paths.resolvePath(
    config.outputFile ?? `extracted_${Date.now()}.${extension}`,
    Core.GOPathType.OUTPUT,
  );

  await exportValues(dataList, outputPath, outputFormat, fieldNames);

  logger.info(`Estrazione completata! ${dataList.length} righe uniche salvate in: ${outputPath}`);
}

function parseS3Uri(uri: string): { bucket: string; key: string } {
  const parts = uri.replace('s3://', '').split('/');
  return {
    bucket: parts[0] ?? '',
    key: parts.slice(1).join('/'),
  };
}
