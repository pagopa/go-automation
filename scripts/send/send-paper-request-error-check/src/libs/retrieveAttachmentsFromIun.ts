import fs from 'fs';
import path from 'path';
import type { AWS, Core } from '@go-automation/go-common';
import type { SendPaperRequestErrorCheckConfig, RetrieveAttachmentsResult } from '../types/index.js';
import { get } from '../utils/get.js';

/** Tabelle DynamoDB coinvolte */
const NOTIFICATIONS_TABLE_NAME = 'pn-Notifications';
const TIMELINES_TABLE_NAME = 'pn-Timelines';

/**
 * Utilità di scrittura/append su file.
 */
function appendToFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(filePath, `${content}\n`, 'utf8');
}

/**
 * Recupera le chiavi S3 degli allegati per una notifica a partire da un IUN.
 */
async function retrieveNotificationAttachments(
  dynamoDbService: AWS.AWSDynamoDBService,
  iun: string,
  outputDir: string,
): Promise<number> {
  const items = await dynamoDbService.query(NOTIFICATIONS_TABLE_NAME, 'iun = :val', {
    ':val': { S: iun },
  });

  if (items.length === 0) {
    return 0;
  }

  const notif = items[0];
  if (!notif) {
    return 0;
  }
  const attachmentKeys: string[] = [];

  // Documenti notifica
  const documents = get<Record<string, unknown>[]>(notif, 'documents', []);
  for (const doc of documents) {
    const ref = get<Record<string, unknown>>(doc, 'ref');
    const key = get<string>(ref, 'key');
    if (key) {
      attachmentKeys.push(key);
    }
  }

  // Modelli PagoPA dei destinatari
  const recipients = get<Record<string, unknown>[]>(notif, 'recipients', []);
  for (const recipient of recipients) {
    const payments = get<Record<string, unknown>[]>(recipient, 'payments', []);
    for (const payment of payments) {
      const pagoPaForm = get<Record<string, unknown>>(payment, 'pagoPaForm');
      const ref = get<Record<string, unknown>>(pagoPaForm, 'ref');
      const key = get<string>(ref, 'key');
      if (key) {
        attachmentKeys.push(key);
      }
    }
  }

  const resultPayload = {
    iun,
    attachments: attachmentKeys,
  };

  const attachmentsFilePath = path.join(outputDir, 'attachments.json');
  appendToFile(attachmentsFilePath, JSON.stringify(resultPayload));

  return attachmentKeys.length;
}

/**
 * Recupera i documenti AAR (AAR_GENERATION) dalla timeline di un IUN.
 */
async function retrieveAARs(dynamoDbService: AWS.AWSDynamoDBService, iun: string, outputDir: string): Promise<number> {
  const items = await dynamoDbService.query(TIMELINES_TABLE_NAME, 'iun = :val', {
    ':val': { S: iun },
  });

  let count = 0;
  const aarFilePath = path.join(outputDir, 'aar.json');

  for (const item of items) {
    const category = get<string>(item, 'category');
    if (category === 'AAR_GENERATION') {
      const details = get<Record<string, unknown>>(item, 'details');
      const generatedAarUrl = get<string>(details, 'generatedAarUrl', '');

      if (generatedAarUrl) {
        const legalFactKey = generatedAarUrl.replace('safestorage://', '');
        appendToFile(aarFilePath, `${iun},${legalFactKey}`);
        count++;
      }
    }
  }

  return count;
}

/**
 * Modulo per il recupero massivo degli allegati e AAR via IUN.
 *
 * @param script - Istanza di Core.GOScript per accedere ai client ed al logger
 * @param iuns - Elenco degli IUN da elaborare
 * @returns Risultati dell'estrazione (allegati ed AAR trovati)
 */
export async function retrieveAttachmentsFromIun(
  script: Core.GOScript,
  iuns: ReadonlyArray<string>,
): Promise<RetrieveAttachmentsResult> {
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const dynamoDbService = script.aws.services.dynamoDB;
  const logger = script.logger;

  const outputDir = config.outputDir || 'results';

  let attachmentsExtractedCount = 0;
  let aarsExtractedCount = 0;
  let errorsCount = 0;

  logger.info(`Inizio recupero allegati ed AAR da pn-Notifications / pn-Timelines per ${iuns.length} IUN...`);

  for (let i = 0; i < iuns.length; i++) {
    const iun = iuns[i]?.trim();
    if (!iun) continue;

    logger.info(`[${i + 1}/${iuns.length}] Recupero allegati per IUN: ${iun}`);

    try {
      const attCount = await retrieveNotificationAttachments(dynamoDbService, iun, outputDir);
      attachmentsExtractedCount += attCount;

      const aarCount = await retrieveAARs(dynamoDbService, iun, outputDir);
      aarsExtractedCount += aarCount;
    } catch (err) {
      errorsCount++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Errore durante il recupero per IUN ${iun}: ${errorMsg}`);
    }
  }

  logger.info(
    `Recupero completato: ${attachmentsExtractedCount} allegati e ${aarsExtractedCount} AAR trovati su ${iuns.length} IUN (${errorsCount} errori).`,
  );

  return {
    totalIuns: iuns.length,
    attachmentsExtractedCount,
    aarsExtractedCount,
    errorsCount,
  };
}
