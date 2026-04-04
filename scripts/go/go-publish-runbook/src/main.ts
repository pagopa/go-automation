/**
 * GO Publish Runbook - Main Logic
 *
 * Implements the core business logic for publishing Markdown runbooks
 * to Confluence Cloud as ADF documents.
 */

import fs from 'fs/promises';
import { Buffer } from 'buffer';
import { markdownToAdf } from 'marklassian';
import { validator } from '@atlaskit/adf-utils/validator';
import type { ADFEntity } from '@atlaskit/adf-utils/types';
import { Core } from '@go-automation/go-common';
import type { GoPublishRunbookConfig } from './config.js';

/**
 * Interface for the input JSON payload
 */
interface RunbookPayload {
  readonly metadata: {
    readonly spaceKey: string;
    readonly parentId: string;
    readonly title: string;
  };
  readonly markdownBody: string;
}

/**
 * Interface for Confluence API v2 Page Response
 */
interface ConfluencePageResponse {
  readonly id: string;
  readonly status: string;
  readonly title: string;
  readonly _links: {
    readonly base: string;
    readonly webui: string;
  };
}

/**
 * Main script logic
 *
 * @param script - The GOScript instance
 */
export async function main(script: Core.GOScript): Promise<void> {
  // 1. Retrieve configuration
  // The configuration is automatically loaded and validated by GOScript
  // It handles sourcing from CLI params, env vars (e.g. CONFLUENCE_BASE_URL), or .env file
  const config = await script.getConfiguration<GoPublishRunbookConfig>();

  const baseUrl = config.confluenceBaseUrl;
  const email = config.confluenceEmail;
  const apiToken = config.confluenceApiToken;

  script.logger.info(`Ingestione payload da: ${config.inputFile}`);

  // 2. Payload Ingestion
  const fileContent = await fs.readFile(config.inputFile, 'utf-8');
  const payload = JSON.parse(fileContent) as RunbookPayload;

  if (!payload.metadata || !payload.markdownBody) {
    throw new Error('Il payload JSON non è valido: mancano metadata o markdownBody.');
  }

  const { spaceKey, parentId, title } = payload.metadata;

  script.logger.info(`Conversione Markdown in ADF per la pagina: "${title}"`);

  // 3. ADF Tree Construction
  // marklassian returns a compliant ADF JSON tree
  const adfRaw = markdownToAdf(payload.markdownBody);
  const adf = adfRaw as unknown as ADFEntity;

  // 4. Internal ADF Validation
  script.logger.info('Validazione ADF generato...');
  const validate = validator();
  const validationResult = validate(adf);

  if (!validationResult.valid) {
    script.logger.error("L'ADF generato non è valido!");
    throw new Error('Validazione ADF fallita. Controlla il formato del Markdown sorgente.');
  }

  // 5. API Interaction (Publishing)
  script.logger.info(`Pubblicazione su Confluence: ${baseUrl}`);

  // Construct Basic Auth Header
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

  const client = new Core.GOHttpClient({
    baseUrl,
    defaultHeaders: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    timeout: 60000,
  });

  try {
    const requestBody = {
      spaceId: spaceKey,
      status: 'current',
      title: title,
      parentId: parentId,
      body: {
        atlas_doc_format: {
          value: JSON.stringify(adf),
          representation: 'atlas_doc_format',
        },
      },
    };

    const response = await client.post<ConfluencePageResponse>('/pages', requestBody);

    // 6. Response Handling & Logging
    const fullLink = `${baseUrl.replace(/\/wiki$/, '')}/wiki${response._links.webui}`;
    script.logger.success('Pagina pubblicata con successo!');
    script.logger.info(`ID Pagina: ${response.id}`);
    script.logger.info(`Link: ${fullLink}`);
  } catch (error: unknown) {
    if (error instanceof Core.GOHttpClientError) {
      script.logger.error(`Errore API Confluence: ${error.message}`);
      if (error.response) {
        script.logger.error(`Dettagli errore Atlassian: ${JSON.stringify(error.response, null, 2)}`);
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      script.logger.error(`Errore imprevisto durante la pubblicazione: ${message}`);
    }
    throw error;
  }
}
