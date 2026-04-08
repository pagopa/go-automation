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

  const finalInputPath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);

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
