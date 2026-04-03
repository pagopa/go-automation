import { Core } from '@go-automation/go-common';
import type { GoJsonParserConfig } from './types/GoJsonParserConfig.js';
import { exportValues } from './libs/createExporter.js';

export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoJsonParserConfig>();
  const logger = script.logger;

  // outputFormat is already validated by the config parameter validator
  const outputFormat = config.outputFormat as Core.GOExportFormat;

  const inputPath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);
  const extractor = new Core.GOJSONFieldExtractor({ parseEmbeddedJson: true });
  const importer = new Core.GOJSONListImporter<string | undefined>({
    jsonl: 'auto',
    skipInvalidItems: true,
    rowTransformer: (item) => {
      const val = extractor.extract(item, config.field);
      if (val == null) return undefined;
      return typeof val === 'string' ? val : JSON.stringify(val);
    },
  });

  importer.on('import:error', (event) => {
    logger.warning(`Campo "${config.field}" non trovato (${event.message}): saltato.`);
  });

  const values = new Set<string>();

  for await (const value of importer.importStream(inputPath)) {
    if (value !== undefined) {
      values.add(value);
    }
  }

  const sortedValues = Array.from(values).sort();

  const extension = Core.GO_EXPORT_FORMAT_EXTENSIONS[outputFormat];
  const outputPath = script.paths.resolvePath(
    config.outputFile ?? `extracted_${Date.now()}.${extension}`,
    Core.GOPathType.OUTPUT,
  );

  await exportValues(sortedValues, outputPath, outputFormat, config.field);

  logger.info(`Estrazione completata! ${values.size} valori unici salvati in: ${outputPath}`);
}
