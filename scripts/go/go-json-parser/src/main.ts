import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { Core } from '@go-automation/go-common';
import type { GoJsonParserConfig } from './config.js';
import { ExtractionEngine } from './libs/ExtractionEngine.js';

export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoJsonParserConfig>();
  const logger = script.logger;

  const inputPath = path.resolve(config.inputFile);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File non trovato: ${inputPath}`);
  }

  const values = new Set<string>();
  const isNDJSON = await detectNDJSON(inputPath);

  if (isNDJSON) {
    logger.info('File rilevato come NDJSON. Inizio streaming...');
    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let lineNum = 0;
    for await (const line of rl) {
      lineNum++;
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        processObject(obj, config.field, values);
      } catch (err) {
        logger.warning(`Linea ${lineNum} non valida JSON: saltata.`);
      }
    }
  } else {
    logger.info('File rilevato come JSON Standard. Caricamento in memoria...');
    const content = fs.readFileSync(inputPath, 'utf8');
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      data.forEach((obj) => processObject(obj, config.field, values));
    } else {
      processObject(data, config.field, values);
    }
  }

  const result = Array.from(values).sort().join('\n');
  const outputPath = config.outputFile 
    ? path.resolve(config.outputFile) 
    : path.join(process.cwd(), 'data', `extracted_${Date.now()}.txt`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, result);
  
  logger.info(`Estrazione completata! ${values.size} valori unici salvati in: ${outputPath}`);
}

function processObject(obj: any, field: string, collector: Set<string>): void {
  const val = ExtractionEngine.extract(obj, field);
  if (val !== undefined && val !== null) {
    collector.add(String(val));
  }
}

async function detectNDJSON(filePath: string): Promise<boolean> {
  if (filePath.endsWith('.ndjson')) return true;
  if (filePath.endsWith('.jsonl')) return true;
  
  const stream = fs.createReadStream(filePath, { start: 0, end: 10 });
  for await (const chunk of stream) {
    const start = chunk.toString().trim();
    if (start.startsWith('{')) return true;
    if (start.startsWith('[')) return false;
  }
  return false;
}
