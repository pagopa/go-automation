import path from 'path';
import { AWS, Core } from '@go-automation/go-common';
import { getConfinfoS3Service, getConfinfoDynamoDBService } from '../utils/awsClients.js';
import type { SendPaperRequestErrorCheckConfig, GetNotificationAttachmentsResult } from '../types/index.js';
import { get, iunFromRid } from '../utils/get.js';

/** Tabelle DynamoDB coinvolte */
const NOTIFICATIONS_TABLE_NAME = 'pn-Notifications';
const SS_DOCUMENTI_TABLE_NAME = 'pn-SsDocumenti';

interface S3ObjectState {
  readonly found: boolean;
  readonly hasDeleteMarker: boolean;
  readonly error?: unknown;
}

/**
 * Recupera lo stato dell'oggetto su S3 SafeStorage (versioni e delete markers).
 */
async function checkS3ObjectState(
  s3Service: AWS.AWSS3Service,
  bucket: string,
  documentKey: string,
): Promise<S3ObjectState> {
  try {
    const entries = await s3Service.listObjectVersions(bucket, documentKey);

    if (entries.length === 0) {
      return { found: false, hasDeleteMarker: false };
    }

    const latestDeleteMarker = entries.find((e) => e.isDeleteMarker && e.isLatest);
    const latestVersion = entries.find((e) => !e.isDeleteMarker && e.isLatest);

    if (latestDeleteMarker) {
      return { found: true, hasDeleteMarker: true };
    } else if (latestVersion) {
      return { found: true, hasDeleteMarker: false };
    } else {
      return { found: false, hasDeleteMarker: false };
    }
  } catch (error) {
    return { found: false, hasDeleteMarker: false, error };
  }
}

/**
 * Esegue la verifica e il ripristino opzionale degli allegati di notifica via IUN.
 *
 * @param script - Istanza di Core.GOScript per logging e client AWS
 * @param iuns - Elenco degli IUN da elaborare
 * @returns Risultati dell'elaborazione
 */
export async function getNotificationAttachments(
  script: Core.GOScript,
  iuns: ReadonlyArray<string>,
): Promise<GetNotificationAttachmentsResult> {
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const dynamoDbService = script.aws.services.dynamoDB;
  const s3Service = getConfinfoS3Service(script, config);
  const logger = script.logger;

  const outputDir = config.outputDir || 'results';
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace('.', '-');

  // Risoluzione bucket di destinazione tramite servizio S3 di common
  let bucket = config.bucket;
  if (!bucket) {
    try {
      const buckets = await s3Service.listBuckets();
      const target = buckets.find((b) => b.name && b.name.includes('safestorage') && !b.name.includes('staging'));
      if (target?.name) {
        bucket = target.name;
      }
    } catch {
      logger.warning(`Impossibile elencare i bucket via S3 Service, imposto bucket predefinito safe-storage`);
    }
    bucket ??= 'pn-safestorage-eu-south-1';
  }

  logger.info(`Bucket SafeStorage di riferimento: ${bucket}`);

  const csvFile = path.join(outputDir, `notification_attachments_${timestamp}.csv`);
  const notFoundNotificationsFile = path.join(outputDir, `not_found_notifications_${timestamp}.txt`);
  const notFoundAttachmentsFile = path.join(outputDir, `not_found_attachments_${timestamp}.csv`);
  const errorAttachmentsFile = path.join(outputDir, `error_attachments_${timestamp}.csv`);

  const csvExporter = new Core.GOFileListExporter({ outputPath: csvFile });
  const notFoundNotificationsExporter = new Core.GOFileListExporter({ outputPath: notFoundNotificationsFile });
  const notFoundAttachmentsExporter = new Core.GOFileListExporter({ outputPath: notFoundAttachmentsFile });
  const errorAttachmentsExporter = new Core.GOFileListExporter({ outputPath: errorAttachmentsFile });

  const csvStream = await csvExporter.exportStream();
  const notFoundNotificationsStream = await notFoundNotificationsExporter.exportStream();
  const notFoundAttachmentsStream = await notFoundAttachmentsExporter.exportStream();
  const errorAttachmentsStream = await errorAttachmentsExporter.exportStream();

  await csvStream.append('IUN,Attachment,documentLogicalState,documentState,hasDeleteMarker');
  await notFoundAttachmentsStream.append('IUN,Attachment');

  let notificationsFound = 0;
  let notificationsNotFound = 0;
  let attachmentsFound = 0;
  let attachmentsNotFound = 0;
  let deleteMarkersFound = 0;
  const dynamoUpdateErrors = 0;

  for (let i = 0; i < iuns.length; i++) {
    //const iun = iuns[i]?.trim();
    const iun = iunFromRid(iuns[i]);
    if (!iun) continue;

    logger.info(`[${i + 1}/${iuns.length}] Elaborazione IUN: ${iun}`);

    try {
      // 1. Query notifica via DynamoDB Service
      const items = await dynamoDbService.query(NOTIFICATIONS_TABLE_NAME, 'iun = :val', {
        ':val': { S: iun },
      });

      if (items.length === 0) {
        notificationsNotFound++;
        await notFoundNotificationsStream.append(iun);
        logger.warning(`Notifica non trovata per IUN ${iun}`);
        continue;
      }

      notificationsFound++;
      const notif = items[0];
      if (!notif) continue;

      const documents = get<Record<string, unknown>[]>(notif, 'documents', []);

      const confinfoDynamoDBService = getConfinfoDynamoDBService(script, config);

      for (const doc of documents) {
        const docRef = get<Record<string, unknown>>(doc, 'ref');
        const documentKey = get<string>(docRef, 'key');

        if (!documentKey) {
          attachmentsNotFound++;
          await notFoundAttachmentsStream.append(`${iun},`);
          logger.warning(`Nessun documentKey trovato nei documenti per IUN ${iun}`);
          continue;
        }

        // 2. Controllo S3
        const s3State = await checkS3ObjectState(s3Service, bucket, documentKey);

        if (s3State.error) {
          let errorMessage = 'Errore Sconosciuto';

          if (s3State.error instanceof Error) {
            errorMessage = s3State.error.message;
          } else if (typeof s3State.error === 'object')
            if ('message' in s3State.error && typeof s3State.error.message === 'string') {
              errorMessage = s3State.error.message;
            } else {
              errorMessage = JSON.stringify(s3State.error);
            }

          logger.error(`Errore S3 per IUN ${iun} (Key: ${documentKey}): ${errorMessage}`);
          await errorAttachmentsStream.append(`${iun},${documentKey},${errorMessage}`);
        }

        if (!s3State.found) {
          attachmentsNotFound++;
          await notFoundAttachmentsStream.append(`${iun},${documentKey}`);
          logger.warning(`Allegato non trovato su S3 per IUN ${iun} (Key: ${documentKey})`);
          continue;
        }

        if (s3State.hasDeleteMarker) {
          deleteMarkersFound++;
          attachmentsNotFound++;
          await notFoundAttachmentsStream.append(`${iun},${documentKey}`);
          logger.warning(`Allegato con Delete Marker su S3 per IUN ${iun} (Key: ${documentKey})`);
          continue;
        }

        // 3. Query pn-SsDocumenti per stato documento via DynamoDB Service
        const docItems = await confinfoDynamoDBService.query(SS_DOCUMENTI_TABLE_NAME, 'documentKey = :val', {
          ':val': { S: documentKey },
        });

        let documentLogicalState = 'UNKNOWN';
        let documentState = 'UNKNOWN';

        if (docItems.length > 0) {
          const docObj = docItems[0];
          if (docObj) {
            documentLogicalState = get<string>(docObj, 'documentLogicalState', 'UNKNOWN');
            documentState = get<string>(docObj, 'documentState', 'UNKNOWN');
          }
        }

        attachmentsFound++;
        await csvStream.append(
          `${iun},${documentKey},${documentLogicalState},${documentState},${s3State.hasDeleteMarker}`,
        );
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Errore nell'elaborazione dell'IUN ${iun}: ${errorMsg}`);
    }
  }

  logger.info(
    `Elaborazione Get Attachments completata: ${notificationsFound} notifiche trovate (${notificationsNotFound} non trovate), ${attachmentsFound} allegati trovati (${attachmentsNotFound} non trovate), ${deleteMarkersFound} con delete marker.`,
  );

  await csvStream.close();
  await notFoundNotificationsStream.close();
  await notFoundAttachmentsStream.close();

  return {
    totalProcessed: iuns.length,
    notificationsFound,
    notificationsNotFound,
    attachmentsFound,
    attachmentsNotFound,
    deleteMarkersFound,
    dynamoUpdateErrors,
  };
}
