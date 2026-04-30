/**
 * GO Parse JSON - Main Logic Module
 *
 * Extracts specific fields from a large JSON/NDJSON file,
 * performs deduplication, and exports the resulting data.
 */

import { Core } from '@go-automation/go-common';
import type { GoParseJsonConfig } from './types/GoParseJsonConfig.js';
import { exportValues } from './libs/createExporter.js';
import { matchesFilter } from './libs/matchesFilter.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoParseJsonConfig>();
  script.logger.section('GO Parse JSON');

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
    script.logger.warning(`Errore durante l'importazione: ${event.message}`);
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

  script.logger.info(`Estrazione completata! ${dataList.length} righe uniche salvate in: ${outputPath}`);
}
