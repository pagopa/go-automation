import fs from 'fs';
import path from 'path';
import { QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { ListObjectVersionsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { Core } from '@go-automation/go-common';
import type { SendPaperRequestErrorCheckConfig, GetNotificationAttachmentsResult } from '../types/index.js';

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
  fs.appendFileSync(filePath, content + '\n', 'utf8');
}

/**
 * Recupera lo stato dell'oggetto su S3 SafeStorage (versioni e delete markers).
 */
async function checkS3ObjectState(
  s3Client: Core.GOScript['aws']['clients']['s3'],
  bucket: string,
  documentKey: string,
) {
  try {
    const command = new ListObjectVersionsCommand({
      Bucket: bucket,
      Prefix: documentKey,
    });
    const res = await s3Client.send(command);
    const versions = (res.Versions || []).filter((v) => v.Key === documentKey);
    const deleteMarkers = (res.DeleteMarkers || []).filter((dm) => dm.Key === documentKey);

    if (versions.length === 0 && deleteMarkers.length === 0) {
      return { found: false, hasDeleteMarker: false, versions: [], deleteMarkers: [] };
    }

    const latestDeleteMarker = deleteMarkers.find((dm) => dm.IsLatest);
    const latestVersion = versions.find((v) => v.IsLatest);

    if (latestDeleteMarker && latestDeleteMarker.IsLatest) {
      return { found: true, hasDeleteMarker: true, versions, deleteMarkers };
    } else if (latestVersion && latestVersion.IsLatest) {
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
  s3Client: Core.GOScript['aws']['clients']['s3'],
  bucket: string,
  documentKey: string,
  deleteMarkers: ReadonlyArray<{ VersionId?: string | undefined }>,
) {
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
async function updateDocumentState(
  dynamoDbClient: Core.GOScript['aws']['clients']['dynamoDB'],
  documentKey: string,
): Promise<boolean> {
  try {
    const command = new UpdateItemCommand({
      TableName: SS_DOCUMENTI_TABLE_NAME,
      Key: {
        documentKey: { S: documentKey },
      },
      UpdateExpression: 'SET #documentState = :newdocumentState',
      ExpressionAttributeNames: {
        '#documentState': 'documentState',
      },
      ExpressionAttributeValues: {
        ':newdocumentState': { S: 'attached' },
      },
    });
    await dynamoDbClient.send(command);
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
  const dynamoDbClient = script.aws.clients.dynamoDB;
  const s3Client = script.aws.clients.s3;
  const logger = script.logger;

  const outputDir = config.outputDir || 'results';
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace('.', '-');

  // Risoluzione bucket di destinazione
  let bucket = config.bucket;
  if (!bucket) {
    try {
      const stsClient = new STSClient({});
      const callerIdentity = await stsClient.send(new GetCallerIdentityCommand({}));
      const accountId = callerIdentity.Account ?? '';
      bucket = `pn-safestorage-eu-south-1-${accountId}`;
    } catch {
      logger.warning(`Impossibile ricavare AccountId via STS, imposto bucket predefinito safe-storage`);
      bucket = 'pn-safestorage-eu-south-1';
    }
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
    const iun = iuns[i]?.trim();
    if (!iun) continue;

    logger.info(`[${i + 1}/${iuns.length}] Elaborazione IUN: ${iun}`);

    try {
      // 1. Query notifica
      const notifQuery = new QueryCommand({
        TableName: NOTIFICATIONS_TABLE_NAME,
        KeyConditionExpression: 'iun = :val',
        ExpressionAttributeValues: { ':val': { S: iun } },
      });

      const notifRes = await dynamoDbClient.send(notifQuery);
      const items: ReadonlyArray<Record<string, AttributeValue>> = notifRes.Items ?? [];

      if (items.length === 0) {
        notificationsNotFound++;
        appendToFile(notFoundNotificationsFile, iun);
        logger.warning(`Notifica non trovata per IUN ${iun}`);
        continue;
      }

      notificationsFound++;
      const notif = unmarshall(items[0]!) as Record<string, unknown>;
      const documents = Array.isArray(notif['documents']) ? (notif['documents'] as Array<Record<string, unknown>>) : [];
      const firstDocRef = documents[0]?.['ref'] as Record<string, unknown> | undefined;
      const documentKey = typeof firstDocRef?.['key'] === 'string' ? firstDocRef['key'] : undefined;

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

      // 3. Query pn-SsDocumenti per stato documento
      const docQuery = new QueryCommand({
        TableName: SS_DOCUMENTI_TABLE_NAME,
        KeyConditionExpression: 'documentKey = :val',
        ExpressionAttributeValues: { ':val': { S: documentKey } },
      });

      const docRes = await dynamoDbClient.send(docQuery);
      const docItems: ReadonlyArray<Record<string, AttributeValue>> = docRes.Items ?? [];

      let documentLogicalState = 'UNKNOWN';
      let documentState = 'UNKNOWN';

      if (docItems.length > 0) {
        const docObj = unmarshall(docItems[0]!) as Record<string, unknown>;
        documentLogicalState = String(docObj['documentLogicalState'] ?? 'UNKNOWN');
        documentState = String(docObj['documentState'] ?? 'UNKNOWN');
      }

      if (config.restore) {
        const updated = await updateDocumentState(dynamoDbClient, documentKey);
        if (!updated) {
          dynamoUpdateErrors++;
          logger.error(`Impossibile aggiornare lo stato DynamoDB per ${documentKey}`);
        } else {
          documentState = 'attached';
        }
      }

      attachmentsFound++;
      appendToFile(
        csvFile,
        `${iun},${documentKey},${documentLogicalState},${documentState},${s3State.hasDeleteMarker ? 'true' : 'false'}`,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Errore durante l'elaborazione di IUN ${iun}: ${errorMsg}`);
    }
  }

  logger.info(`Elaborazione allegati notifiche completata per ${iuns.length} IUN.`);

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
