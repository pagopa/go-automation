import fs from 'fs';
import path from 'path';
import { ListObjectVersionsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import type { AWS, Core } from '@go-automation/go-common';
import type { SendPaperRequestErrorCheckConfig, GetNotificationAttachmentsResult } from '../types/index.js';
import { get } from '../utils/get.js';
import { iun_from_rid } from '../utils/get.js';

/** Tabelle DynamoDB coinvolte */
const NOTIFICATIONS_TABLE_NAME = 'pn-Notifications';
const SS_DOCUMENTI_TABLE_NAME = 'pn-SsDocumenti';

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

export interface S3ObjectState {
  readonly found: boolean;
  readonly hasDeleteMarker: boolean;
  readonly versions: ReadonlyArray<unknown>;
  readonly deleteMarkers: ReadonlyArray<{ VersionId?: string | undefined }>;
  readonly error?: unknown;
}

/**
 * Recupera lo stato dell'oggetto su S3 SafeStorage (versioni e delete markers).
 */
async function checkS3ObjectState(s3Client: S3Client, bucket: string, documentKey: string): Promise<S3ObjectState> {
  try {
    const command = new ListObjectVersionsCommand({
      Bucket: bucket,
      Prefix: documentKey,
    });
    const res = await s3Client.send(command);
    const versions = (res.Versions ?? []).filter((v) => v.Key === documentKey);
    const deleteMarkers = (res.DeleteMarkers ?? []).filter((dm) => dm.Key === documentKey);

    if (versions.length === 0 && deleteMarkers.length === 0) {
      return { found: false, hasDeleteMarker: false, versions: [], deleteMarkers: [] };
    }

    const latestDeleteMarker = deleteMarkers.find((dm) => dm.IsLatest);
    const latestVersion = versions.find((v) => v.IsLatest);

    if (latestDeleteMarker?.IsLatest) {
      return { found: true, hasDeleteMarker: true, versions, deleteMarkers };
    } else if (latestVersion?.IsLatest) {
      return { found: true, hasDeleteMarker: false, versions, deleteMarkers };
    } else {
      return { found: false, hasDeleteMarker: false, versions, deleteMarkers };
    }
  } catch (error) {
    return { found: false, hasDeleteMarker: false, versions: [], deleteMarkers: [], error };
  }
}

/**
 * Rimuove i Delete Markers da S3 per consentire il ripristino dell'allegato.
 */
async function removeDeleteMarkers(
  s3Client: S3Client,
  bucket: string,
  documentKey: string,
  deleteMarkers: ReadonlyArray<{ VersionId?: string | undefined }>,
): Promise<void> {
  for (const marker of deleteMarkers) {
    if (!marker.VersionId) continue;
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: documentKey,
          VersionId: marker.VersionId,
        }),
      );
    } catch {
      // Ignora errori di rimozione singoli
    }
  }
}

/**
 * Aggiorna lo stato del documento su pn-SsDocumenti a 'attached'.
 */
async function updateDocumentState(dynamoDbService: AWS.AWSDynamoDBService, documentKey: string): Promise<boolean> {
  try {
    await dynamoDbService.updateItem(
      SS_DOCUMENTI_TABLE_NAME,
      { documentKey },
      'SET #documentState = :newdocumentState',
      { ':newdocumentState': 'attached' },
      { '#documentState': 'documentState' },
    );
    return true;
  } catch {
    return false;
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
  const s3Service = script.aws.services.s3;
  const s3Client = script.aws.clients.s3;
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
  logger.info(`Modalità ripristino (--restore): ${config.restore ? 'ATTIVA' : 'DISATTIVATA'}`);

  const csvFile = path.join(outputDir, `notification_attachments_${timestamp}.csv`);
  const notFoundNotificationsFile = path.join(outputDir, `not_found_notifications_${timestamp}.txt`);
  const notFoundAttachmentsFile = path.join(outputDir, `not_found_attachments_${timestamp}.csv`);

  appendToFile(csvFile, 'IUN,Attachment,documentLogicalState,documentState,hasDeleteMarker');
  appendToFile(notFoundAttachmentsFile, 'IUN,Attachment');

  let notificationsFound = 0;
  let notificationsNotFound = 0;
  let attachmentsFound = 0;
  let attachmentsNotFound = 0;
  let deleteMarkersFound = 0;
  let dynamoUpdateErrors = 0;

  for (let i = 0; i < iuns.length; i++) {
    //const iun = iuns[i]?.trim();
    const iun = iun_from_rid(iuns[i]);
    if (!iun) continue;

    logger.info(`[${i + 1}/${iuns.length}] Elaborazione IUN: ${iun}`);

    try {
      // 1. Query notifica via DynamoDB Service
      const items = await dynamoDbService.query(NOTIFICATIONS_TABLE_NAME, 'iun = :val', {
        ':val': { S: iun },
      });

      if (items.length === 0) {
        notificationsNotFound++;
        appendToFile(notFoundNotificationsFile, iun);
        logger.warning(`Notifica non trovata per IUN ${iun}`);
        continue;
      }

      notificationsFound++;
      const notif = items[0];
      if (!notif) continue;

      const documents = get<Record<string, unknown>[]>(notif, 'documents', []);
      const firstDocRef = get<Record<string, unknown>>(documents[0], 'ref');
      const documentKey = get<string>(firstDocRef, 'key');

      if (!documentKey) {
        attachmentsNotFound++;
        appendToFile(notFoundAttachmentsFile, `${iun},`);
        logger.warning(`Nessun documentKey trovato nei documenti per IUN ${iun}`);
        continue;
      }

      // 2. Controllo S3
      const s3State = await checkS3ObjectState(s3Client, bucket, documentKey);
      if (!s3State.found) {
        attachmentsNotFound++;
        appendToFile(notFoundAttachmentsFile, `${iun},${documentKey}`);
        logger.warning(`Allegato non trovato su S3 per IUN ${iun} (Key: ${documentKey})`);
        continue;
      }

      if (s3State.hasDeleteMarker) {
        deleteMarkersFound++;
        if (config.restore) {
          logger.info(`Rimozione Delete Markers per IUN ${iun} (Key: ${documentKey})...`);
          await removeDeleteMarkers(s3Client, bucket, documentKey, s3State.deleteMarkers);
        }
      }

      // 3. Query pn-SsDocumenti per stato documento via DynamoDB Service
      const docItems = await dynamoDbService.query(SS_DOCUMENTI_TABLE_NAME, 'documentKey = :val', {
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
      appendToFile(
        csvFile,
        `${iun},${documentKey},${documentLogicalState},${documentState},${s3State.hasDeleteMarker}`,
      );

      // 4. Ripristino stato documento se richiesto
      if (config.restore && (s3State.hasDeleteMarker || documentState !== 'attached')) {
        logger.info(`Aggiornamento stato documento a 'attached' per IUN ${iun} su pn-SsDocumenti...`);
        const updated = await updateDocumentState(dynamoDbService, documentKey);
        if (updated) {
          logger.info(`Stato aggiornato con successo a 'attached' per Key ${documentKey}`);
        } else {
          dynamoUpdateErrors++;
          logger.error(`Errore durante l'aggiornamento dello stato per Key ${documentKey}`);
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Errore nell'elaborazione dell'IUN ${iun}: ${errorMsg}`);
    }
  }

  logger.info(
    `Elaborazione Get Attachments completata: ${notificationsFound} notifiche trovate (${notificationsNotFound} non trovate), ${attachmentsFound} allegati trovati (${attachmentsNotFound} non trovati), ${deleteMarkersFound} con delete marker.`,
  );

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
