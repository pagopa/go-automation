import * as fs from 'fs/promises';
import * as path from 'path';
import { Core } from '@go-automation/go-common';
import type { GoJsonParserConfig } from './types/GoJsonParserConfig.js';

export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoJsonParserConfig>();
  const logger = script.logger;

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

  const result = Array.from(values).sort().join('\n');
  const outputPathInfo = script.paths.resolvePathWithInfo(
    config.outputFile ?? `extracted_${Date.now()}.txt`,
    Core.GOPathType.OUTPUT,
  );

  await fs.mkdir(path.dirname(outputPathInfo.path), { recursive: true });
  await fs.writeFile(outputPathInfo.path, result);

  logger.info(`Estrazione completata! ${values.size} valori unici salvati in: ${outputPathInfo.path}`);
}
