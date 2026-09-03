import fs from 'fs';
import path from 'path';
import { QueryCommand } from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { Core } from '@go-automation/go-common';
import type { SendPaperRequestErrorCheckConfig, RetrieveAttachmentsResult } from '../types/index.js';

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
  fs.appendFileSync(filePath, content + '\n', 'utf8');
}

/**
 * Recupera le chiavi S3 degli allegati per una notifica a partire da un IUN.
 */
async function retrieveNotificationAttachments(
  dynamoDbClient: Core.GOScript['aws']['clients']['dynamoDB'],
  iun: string,
  outputDir: string,
): Promise<number> {
  const command = new QueryCommand({
    TableName: NOTIFICATIONS_TABLE_NAME,
    KeyConditionExpression: 'iun = :val',
    ExpressionAttributeValues: { ':val': { S: iun } },
    ProjectionExpression: 'documents, recipients',
  });

  const response = await dynamoDbClient.send(command);
  const items: ReadonlyArray<Record<string, AttributeValue>> = response.Items ?? [];

  if (items.length === 0) {
    return 0;
  }

  const notif = unmarshall(items[0]!) as Record<string, unknown>;
  const attachmentKeys: string[] = [];

  // Documenti notifica
  const documents = Array.isArray(notif['documents']) ? (notif['documents'] as Array<Record<string, unknown>>) : [];
  for (const doc of documents) {
    const ref = doc['ref'] as Record<string, unknown> | undefined;
    if (typeof ref?.['key'] === 'string') {
      attachmentKeys.push(ref['key']);
    }
  }

  // Modelli PagoPA dei destinatari
  const recipients = Array.isArray(notif['recipients']) ? (notif['recipients'] as Array<Record<string, unknown>>) : [];
  for (const recipient of recipients) {
    const payments = Array.isArray(recipient['payments']) ? (recipient['payments'] as Array<Record<string, unknown>>) : [];
    for (const payment of payments) {
      const pagoPaForm = payment['pagoPaForm'] as Record<string, unknown> | undefined;
      const ref = pagoPaForm?.['ref'] as Record<string, unknown> | undefined;
      if (typeof ref?.['key'] === 'string') {
        attachmentKeys.push(ref['key']);
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
async function retrieveAARs(
  dynamoDbClient: Core.GOScript['aws']['clients']['dynamoDB'],
  iun: string,
  outputDir: string,
): Promise<number> {
  const command = new QueryCommand({
    TableName: TIMELINES_TABLE_NAME,
    KeyConditionExpression: 'iun = :val',
    ExpressionAttributeValues: { ':val': { S: iun } },
  });

  const response = await dynamoDbClient.send(command);
  const items: ReadonlyArray<Record<string, AttributeValue>> = response.Items ?? [];

  let count = 0;
  const aarFilePath = path.join(outputDir, 'aar.json');

  for (const item of items) {
    const category = item['category']?.S;
    if (category === 'AAR_GENERATION') {
      const unmarshalled = unmarshall(item) as Record<string, unknown>;
      const details = unmarshalled['details'] as Record<string, unknown> | undefined;
      const generatedAarUrl = typeof details?.['generatedAarUrl'] === 'string' ? details['generatedAarUrl'] : '';

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
  const dynamoDbClient = script.aws.clients.dynamoDB;
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
      const attCount = await retrieveNotificationAttachments(dynamoDbClient, iun, outputDir);
      attachmentsExtractedCount += attCount;

      const aarCount = await retrieveAARs(dynamoDbClient, iun, outputDir);
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
