import * as fs from 'fs/promises';
import * as path from 'path';
import { Core } from '@go-automation/go-common';
import type { GoJsonParserConfig } from './config.js';

export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoJsonParserConfig>();
  const logger = script.logger;

  const inputPath = resolvePath(config.inputFile, script.paths.getBaseDir());

  await fs.access(inputPath).catch(() => {
    throw new Error(`File non trovato: ${inputPath}`);
  });

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
  const outputPath = config.outputFile
    ? resolvePath(config.outputFile, script.paths.getBaseDir())
    : path.join(script.paths.getOutputsBaseDir(), `extracted_${Date.now()}.txt`);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, result);

  logger.info(`Estrazione completata! ${values.size} valori unici salvati in: ${outputPath}`);
}

function resolvePath(filePath: string, baseDir: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}
