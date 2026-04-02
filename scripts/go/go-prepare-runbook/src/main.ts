/**
 * GO Prepare Runbook - Core Business Logic
 */

import { Core } from '@go-automation/go-common';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { RunbookFrontmatterSchema, type RunbookPayload } from './libs/RunbookSchema.js';
import type { GoPrepareRunbookConfig } from './config.js';

/**
 * Main function for go-prepare-runbook
 *
 * Steps:
 * 1. Read input Markdown file
 * 2. Parse frontmatter with gray-matter
 * 3. Resolve and merge shared assets
 * 4. Validate metadata with zod
 * 5. Generate and write JSON payload
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoPrepareRunbookConfig>();
  const inputFile = config['input-file'];
  const sharedAssetsDir = config['shared-assets-dir'];
  const outputFile = config['output-file'];

  script.logger.info(`Inizio preparazione runbook: ${inputFile}`);

  // Step 3.1: Read input file
  let rawContent: string;
  try {
    rawContent = await fs.readFile(inputFile, 'utf-8');
  } catch (error) {
    throw new Error(`Impossibile leggere il file di input "${inputFile}": ${(error as Error).message}`, {
      cause: error,
    });
  }

  // Step 3.2: Parsing
  const { data: rawFrontmatter, content: markdownBody } = matter(rawContent);

  // Step 3.3: Reference Resolution (Shared Assets)
  const resolvedMetadata = { ...rawFrontmatter };
  let resolvedMarkdown = markdownBody;

  // Caricamento dizionario asset
  const assetsDictionary = await loadSharedAssets(sharedAssetsDir, script.logger);

  // Deep-merge dei metadati (se referenziati in frontmatter)
  // Per semplicità, se in frontmatter c'è una chiave "assets", carichiamo i metadati associati
  const assets = rawFrontmatter['assets'] as unknown;
  if (Array.isArray(assets)) {
    for (const assetId of assets) {
      if (typeof assetId === 'string') {
        const assetData = assetsDictionary.metadata.get(assetId);
        if (assetData) {
          script.logger.info(`Merging asset metadata: ${assetId}`);
          Object.assign(resolvedMetadata, assetData);
        } else {
          script.logger.warning(`Asset metadata non trovato: ${assetId}`);
        }
      }
    }
  }

  // Sostituzione placeholder nel markdown: {{ asset_name }}
  const assetPlaceholderRegex = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
  resolvedMarkdown = resolvedMarkdown.replace(assetPlaceholderRegex, (match, assetId: string) => {
    const assetContent = assetsDictionary.content.get(assetId);
    if (assetContent) {
      script.logger.info(`Sostituzione asset content placeholder: ${assetId}`);
      return assetContent;
    }
    script.logger.warning(`Asset content non trovato per placeholder: ${assetId}`);
    return match; // Lascia il placeholder se non trovato
  });

  // Step 3.4 & 3.5: Schema Validation & Normalization
  script.logger.info('Validazione metadati con Zod...');
  const validationResult = RunbookFrontmatterSchema.safeParse(resolvedMetadata);

  if (!validationResult.success) {
    const errorDetails = validationResult.error.issues
      .map((issue) => `- [${issue.path.join('.')}] ${issue.message}`)
      .join('\n');
    throw new Error(`Validazione frontmatter fallita:\n${errorDetails}`);
  }

  const validatedMetadata = validationResult.data;

  // Step 3.6: Output Generation
  const payload: RunbookPayload = {
    metadata: validatedMetadata,
    markdownBody: resolvedMarkdown.trim(),
  };

  const jsonOutput = JSON.stringify(payload, null, 2);

  try {
    const outputDir = path.dirname(outputFile);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputFile, jsonOutput, 'utf-8');
    script.logger.success(`Payload generato con successo: ${outputFile}`);
  } catch (error) {
    throw new Error(`Impossibile scrivere il file di output "${outputFile}": ${(error as Error).message}`, {
      cause: error,
    });
  }
}

/**
 * Carica gli asset condivisi da una directory.
 * Supporta .json per metadati e .md per contenuti.
 */
async function loadSharedAssets(
  dirPath: string,
  logger: Core.GOLogger,
): Promise<{
  metadata: Map<string, unknown>;
  content: Map<string, string>;
}> {
  const metadataMap = new Map<string, unknown>();
  const contentMap = new Map<string, string>();

  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const ext = path.extname(file);
      const assetId = path.basename(file, ext);

      if (ext === '.json') {
        const rawJson = await fs.readFile(filePath, 'utf-8');
        try {
          metadataMap.set(assetId, JSON.parse(rawJson));
        } catch (e) {
          logger.error(`Errore nel parsing dell'asset JSON "${file}": ${(e as Error).message}`);
        }
      } else if (ext === '.md') {
        const rawMd = await fs.readFile(filePath, 'utf-8');
        contentMap.set(assetId, rawMd);
      }
    }
  } catch (error) {
    // Se la directory non esiste o non è leggibile, logghiamo un warning e torniamo mappe vuote
    logger.warning(`Impossibile caricare asset condivisi da "${dirPath}": ${(error as Error).message}`);
  }

  return {
    metadata: metadataMap,
    content: contentMap,
  };
}
