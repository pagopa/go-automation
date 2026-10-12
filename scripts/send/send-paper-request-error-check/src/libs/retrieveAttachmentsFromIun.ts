import path from 'path';
import { Core, AWS } from '@go-automation/go-common';
import { getCoreDynamoDBService } from '../utils/awsClients.js';
import type { SendPaperRequestErrorCheckConfig, RetrieveAttachmentsResult } from '../types/index.js';
import { get, iunFromRid } from '../utils/get.js';
import {
  isNotificationOlderThanOneYear,
  isNotificationExcluded,
  type TimelineEvent,
} from './verifyNotification.js';

/** Tabelle DynamoDB coinvolte */
const NOTIFICATIONS_TABLE_NAME = 'pn-Notifications';
const TIMELINES_TABLE_NAME = 'pn-Timelines';

interface NotificationAttachmentsData {
  readonly attachmentKeys: string[];
  readonly sentAt?: string | undefined;
}

interface NotificationAarData {
  readonly aarKeys: string[];
  readonly timelineEvents: TimelineEvent[];
  readonly notificationSentAt?: string | undefined;
}

/**
 * Recupera le chiavi S3 degli allegati e la data di invio (sentAt) per una notifica da pn-Notifications.
 */
async function retrieveNotificationAttachments(
  dynamoDbService: AWS.AWSDynamoDBService,
  iun: string,
  attachmentsStream: Core.GOListExporterStreamWriter<string>,
): Promise<NotificationAttachmentsData> {
  const items = await dynamoDbService.query(NOTIFICATIONS_TABLE_NAME, 'iun = :val', {
    ':val': { S: iun },
  });

  if (items.length === 0) {
    return { attachmentKeys: [] };
  }

  const notif = items[0];
  if (!notif) {
    return { attachmentKeys: [] };
  }

  const sentAt = get<string>(notif, 'sentAt');
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
    sentAt,
    attachments: attachmentKeys,
  };

  await attachmentsStream.append(JSON.stringify(resultPayload));

  return {
    attachmentKeys,
    sentAt,
  };
}

/**
 * Recupera i documenti AAR (AAR_GENERATION) e la lista eventi timeline per un IUN da pn-Timelines.
 */
async function retrieveAARs(
  dynamoDbService: AWS.AWSDynamoDBService,
  iun: string,
  aarStream: Core.GOListExporterStreamWriter<string>,
): Promise<NotificationAarData> {
  const items = await dynamoDbService.query(TIMELINES_TABLE_NAME, 'iun = :val', {
    ':val': { S: iun },
  });

  const aarKeys: string[] = [];
  const timelineEvents: TimelineEvent[] = [];
  let notificationSentAt: string | undefined;

  for (const item of items) {
    notificationSentAt ??= get<string>(item, 'notificationSentAt');

    const category = get<string>(item, 'category');
    const timestamp = get<string>(item, 'timestamp');
    const timelineElementId = get<string>(item, 'timelineElementId');

    if (category) {
      timelineEvents.push({
        category,
        timestamp,
        timelineElementId,
      });
    }

    if (category === 'AAR_GENERATION') {
      const details = get<Record<string, unknown>>(item, 'details');
      const generatedAarUrl = get<string>(details, 'generatedAarUrl', '');

      if (generatedAarUrl) {
        const legalFactKey = generatedAarUrl.replace('safestorage://', '');
        await aarStream.append(`${iun},${legalFactKey}`);
        aarKeys.push(legalFactKey);
      }
    }
  }

  return {
    aarKeys,
    timelineEvents,
    notificationSentAt,
  };
}

/**
 * Modulo per il recupero massivo e classificazione di allegati ed AAR via IUN.
 *
 * @param script - Istanza di Core.GOScript per accedere ai client ed al logger
 * @param iuns - Elenco degli IUN da elaborare
 * @returns Risultati dell'estrazione (allegati ed AAR con separazione Glacier e Validazione PDF)
 */
export async function retrieveAttachmentsFromIun(
  script: Core.GOScript,
  iuns: ReadonlyArray<string>,
): Promise<RetrieveAttachmentsResult> {
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const dynamoDbService = getCoreDynamoDBService(script, config);
  const logger = script.logger;

  const outputDir = config.outputDir || 'results';

  const attachmentsFilePath = path.join(outputDir, 'attachments.json');
  const aarFilePath = path.join(outputDir, 'aar.json');
  const glacierEligibleFilePath = path.join(outputDir, 'glacier_eligible_aar.csv');
  const validPdfAttachmentsFilePath = path.join(outputDir, 'pdf_validation_eligible_attachments.csv');
  const skippedAttachmentsFilePath = path.join(outputDir, 'skipped_attachments_delete_marker.csv');

  const attachmentsExporter = new Core.GOFileListExporter({ outputPath: attachmentsFilePath });
  const aarExporter = new Core.GOFileListExporter({ outputPath: aarFilePath });
  const glacierEligibleExporter = new Core.GOFileListExporter({ outputPath: glacierEligibleFilePath });
  const validPdfAttachmentsExporter = new Core.GOFileListExporter({ outputPath: validPdfAttachmentsFilePath });
  const skippedAttachmentsExporter = new Core.GOFileListExporter({ outputPath: skippedAttachmentsFilePath });

  const attachmentsStream = await attachmentsExporter.exportStream();
  const aarStream = await aarExporter.exportStream();
  const glacierEligibleStream = await glacierEligibleExporter.exportStream();
  const validPdfAttachmentsStream = await validPdfAttachmentsExporter.exportStream();
  const skippedAttachmentsStream = await skippedAttachmentsExporter.exportStream();

  await glacierEligibleStream.append('IUN,fileKey,sentAt');
  await validPdfAttachmentsStream.append('IUN,fileKey');
  await skippedAttachmentsStream.append('IUN,fileKey,reason');

  let attachmentsExtractedCount = 0;
  let aarsExtractedCount = 0;
  let errorsCount = 0;

  const extractedKeys: string[] = [];
  const attachmentKeys: string[] = [];
  const aarKeys: string[] = [];
  const glacierEligibleAarKeys: string[] = [];
  const validPdfAttachmentKeys: string[] = [];
  let skippedAttachmentsDeleteMarkerCount = 0;
  let skippedAarActiveTierCount = 0;

  logger.info(`Inizio recupero e analisi allegati ed AAR per ${iuns.length} IUN...`);

  for (let i = 0; i < iuns.length; i++) {
    const iun = iunFromRid(iuns[i]);
    if (!iun) continue;

    logger.info(`[${i + 1}/${iuns.length}] Recupero per IUN: ${iun}`);

    try {
      const attData = await retrieveNotificationAttachments(dynamoDbService, iun, attachmentsStream);
      const aarData = await retrieveAARs(dynamoDbService, iun, aarStream);

      const effectiveSentAt = attData.sentAt || aarData.notificationSentAt;
      const isOlder1Y = isNotificationOlderThanOneYear(effectiveSentAt);
      const exclusionResult = isNotificationExcluded(aarData.timelineEvents);

      attachmentsExtractedCount += attData.attachmentKeys.length;
      aarsExtractedCount += aarData.aarKeys.length;

      // 1. Elaborazione Documenti AAR
      for (const k of aarData.aarKeys) {
        const itemLine = `${iun},${k}`;
        extractedKeys.push(itemLine);
        aarKeys.push(itemLine);

        if (isOlder1Y) {
          glacierEligibleAarKeys.push(itemLine);
          await glacierEligibleStream.append(`${iun},${k},${effectiveSentAt ?? 'UNKNOWN'}`);
        } else {
          skippedAarActiveTierCount++;
        }
      }

      // 2. Elaborazione Allegati Notifica
      for (const k of attData.attachmentKeys) {
        const itemLine = `${iun},${k}`;
        extractedKeys.push(itemLine);
        attachmentKeys.push(itemLine);

        if (!exclusionResult.excluded) {
          validPdfAttachmentKeys.push(itemLine);
          await validPdfAttachmentsStream.append(`${iun},${k}`);
        } else {
          skippedAttachmentsDeleteMarkerCount++;
          await skippedAttachmentsStream.append(`${iun},${k},${exclusionResult.reason ?? 'EXCLUDED'}`);
        }
      }
    } catch (err) {
      errorsCount++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Errore durante il recupero per IUN ${iun}: ${errorMsg}`);
    }
  }

  logger.info(
    `Riepilogo estrazione: ${attachmentsExtractedCount} allegati (${validPdfAttachmentKeys.length} idonei per validazione PDF, ${skippedAttachmentsDeleteMarkerCount} scartati con delete marker) e ${aarsExtractedCount} AAR (${glacierEligibleAarKeys.length} eleggibili Glacier >1 anno, ${skippedAarActiveTierCount} in active tier <=1 anno).`,
  );

  await attachmentsStream.close();
  await aarStream.close();
  await glacierEligibleStream.close();
  await validPdfAttachmentsStream.close();
  await skippedAttachmentsStream.close();

  return {
    totalIuns: iuns.length,
    attachmentsExtractedCount,
    aarsExtractedCount,
    errorsCount,
    extractedKeys,
    attachmentKeys,
    aarKeys,
    glacierEligibleAarKeys,
    validPdfAttachmentKeys,
    skippedAttachmentsDeleteMarkerCount,
    skippedAarActiveTierCount,
  };
}
