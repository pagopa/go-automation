import path from 'path';
import { Core, AWS } from '@go-automation/go-common';
import { getConfinfoS3Service, getCoreDynamoDBService } from '../utils/awsClients.js';
import type { SendPaperRequestErrorCheckConfig, PdfValidationResult } from '../types/index.js';
import { isNotificationOlderThanOneYear } from './verifyNotification.js';
import { get } from '../utils/get.js';

const NOTIFICATIONS_TABLE_NAME = 'pn-Notifications';

/** Signature Magic Bytes del formato PDF ("%PDF" = 0x25 0x50 0x44 0x46) */
const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46]);

/**
 * Verifica se una chiave file appartiene a un documento AAR (Avviso di Avvenuta Ricezione).
 */
function isAarFileKey(fileKey: string): boolean {
  const upper = fileKey.toUpperCase();
  return upper.includes('AAR') || upper.includes('LEGAL_FACT');
}

/**
 * Esito della validazione dei magic bytes di un singolo file S3.
 */
interface SinglePdfValidationOutcome {
  readonly fileKey: string;
  readonly valid: boolean;
  readonly error?: string | undefined;
}

/**
 * Valida se un oggetto S3 è un PDF valido leggendo solo i primi 5 byte (Range request: bytes=0-4).
 */
async function validatePDFMagicBytes(
  s3Service: AWS.AWSS3Service,
  bucket: string,
  fileKey: string,
): Promise<SinglePdfValidationOutcome> {
  try {
    const buffer = await s3Service.getObjectBytes(bucket, fileKey, 0, 4);

    const isPdf =
      buffer.length >= 4 &&
      buffer[0] === PDF_MAGIC_BYTES[0] &&
      buffer[1] === PDF_MAGIC_BYTES[1] &&
      buffer[2] === PDF_MAGIC_BYTES[2] &&
      buffer[3] === PDF_MAGIC_BYTES[3];

    return {
      fileKey,
      valid: isPdf,
      error: isPdf ? undefined : 'InvalidMagicBytes',
    };
  } catch (err: unknown) {
    const errorObj = err as { name?: string; message?: string };
    const errorType = errorObj.name ?? 'UnknownError';
    return {
      fileKey,
      valid: false,
      error: errorType,
    };
  }
}

/**
 * Risolve il bucket S3 SafeStorage se non configurato esplicitamente.
 * Usa il profilo Confinfo per elencare i bucket (SafeStorage è nell'account Confinfo).
 */
async function resolveSafestorageBucket(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
  configuredBucket?: string,
): Promise<string> {
  if (configuredBucket) return configuredBucket;

  try {
    const s3Service = getConfinfoS3Service(script, config);
    const buckets = await s3Service.listBuckets();
    const target = buckets.find((b) => b.name && b.name.includes('safestorage') && !b.name.includes('staging'));
    if (target?.name) return target.name;
  } catch {
    // Fallback
  }

  return 'pn-safestorage-eu-south-1';
}

/**
 * Esegue la validazione parallela con controllo di concorrenza sui magic bytes dei file S3.
 *
 * @param script - Istanza GOScript
 * @param inputKeys - Elenco delle chiavi S3 o righe CSV da validare
 * @returns Risultati aggregati della validazione PDF
 */
export async function validateS3Pdfs(
  script: Core.GOScript,
  inputKeys?: ReadonlyArray<string>,
): Promise<PdfValidationResult> {
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const s3Service = getConfinfoS3Service(script, config);
  const logger = script.logger;

  const outputDir = config.outputDir || 'results';

  // Estrazione e filtraggio delle chiavi S3 da validare (inclusi allegati ed AAR in active tier, esclusi AAR in Glacier)
  const fileKeys: string[] = [];
  const sentAtCache = new Map<string, string | undefined>();
  let dynamoDbService: AWS.AWSDynamoDBService | undefined;

  if (inputKeys) {
    for (const line of inputKeys) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Supporta sia formato semplice 'fileKey', CSV 'IUN,fileKey' e 'IUN,fileKey,sentAt'
      const parts = trimmed.split(',');
      let iun: string | undefined;
      let key: string | undefined;
      let sentAt: string | undefined;

      if (parts.length >= 3) {
        iun = parts[0]?.trim();
        key = parts[1]?.trim();
        sentAt = parts[2]?.trim();
      } else if (parts.length === 2) {
        iun = parts[0]?.trim();
        key = parts[1]?.trim();
      } else {
        key = parts[0]?.trim();
      }

      if (!key || (iun === 'IUN' && key === 'fileKey')) continue;

      if (isAarFileKey(key)) {
        // Se è un documento AAR, verifichiamo se appartiene a una notifica > 1 anno (tier Glacier)
        if (!sentAt && iun && iun !== 'N/A') {
          if (!sentAtCache.has(iun)) {
            try {
              dynamoDbService ??= getCoreDynamoDBService(script, config);
              const notifItems = await dynamoDbService.query(NOTIFICATIONS_TABLE_NAME, 'iun = :val', {
                ':val': { S: iun },
              });
              const retrievedSentAt = notifItems[0] ? get<string>(notifItems[0], 'sentAt') : undefined;
              sentAtCache.set(iun, retrievedSentAt);
            } catch {
              sentAtCache.set(iun, undefined);
            }
          }
          sentAt = sentAtCache.get(iun);
        }

        if (sentAt && isNotificationOlderThanOneYear(sentAt)) {
          logger.info(
            `ℹ️ File AAR ${key} (IUN: ${iun ?? 'N/A'}) appartiene a notifica > 1 anno in tier Glacier, escluso dalla validazione PDF.`,
          );
          continue;
        }

        logger.info(`📄 Inclusione file AAR ${key} per la validazione PDF (active tier).`);
      }

      fileKeys.push(key);
    }
  }

  if (fileKeys.length === 0) {
    logger.warning('Nessun fileKey valido fornito per la validazione dei PDF su S3.');
    return {
      totalChecked: 0,
      validPdfCount: 0,
      invalidPdfCount: 0,
      errorCount: 0,
    };
  }

  const bucket = await resolveSafestorageBucket(script, config, config.bucket);
  const concurrency = Math.max(1, config.pdfValidationConcurrency ?? 20);

  logger.info(
    `Inizio validazione magic bytes su ${fileKeys.length} oggetti S3 nel bucket [${bucket}] (Concorrenza: ${concurrency})...`,
  );

  const validPdfsFile = path.join(outputDir, 'valid_pdfs.csv');
  const invalidPdfsFile = path.join(outputDir, 'invalid_pdfs.csv');
  const errorsFile = path.join(outputDir, 'pdf_validation_errors.csv');

  const validExporter = new Core.GOFileListExporter({ outputPath: validPdfsFile });
  const invalidExporter = new Core.GOFileListExporter({ outputPath: invalidPdfsFile });
  const errorsExporter = new Core.GOFileListExporter({ outputPath: errorsFile });

  const validStream = await validExporter.exportStream();
  const invalidStream = await invalidExporter.exportStream();
  const errorsStream = await errorsExporter.exportStream();

  await validStream.append('fileKey');
  await invalidStream.append('fileKey,reason');
  await errorsStream.append('fileKey,error');

  let validPdfCount = 0;
  let invalidPdfCount = 0;
  let errorCount = 0;

  // Elaborazione a blocchi di concorrenza
  for (let i = 0; i < fileKeys.length; i += concurrency) {
    const batch = fileKeys.slice(i, i + concurrency);
    logger.info(`Validazione batch [${i + 1}-${Math.min(i + concurrency, fileKeys.length)}/${fileKeys.length}]...`);

    const promises = batch.map(async (fileKey) => validatePDFMagicBytes(s3Service, bucket, fileKey));
    const results = await Promise.all(promises);

    for (const res of results) {
      if (res.valid) {
        validPdfCount++;
        await validStream.append(res.fileKey);
      } else if (res.error === 'InvalidObjectState' && isAarFileKey(res.fileKey)) {
        logger.info(
          `ℹ️ File AAR ${res.fileKey} è in tier Glacier (non accessibile immediatamente), escluso dalla validazione PDF.`,
        );
      } else if (res.error === 'InvalidMagicBytes') {
        invalidPdfCount++;
        logger.warning(`❌ PDF Non Valido (Magic Bytes errati): ${res.fileKey}`);
        await invalidStream.append(`${res.fileKey},InvalidMagicBytes`);
      } else {
        errorCount++;
        logger.error(`⚠️ Errore durante il check del file ${res.fileKey}: ${res.error}`);
        await errorsStream.append(`${res.fileKey},${res.error ?? 'Unknown'}`);
      }
    }
  }

  logger.info(
    `Validazione PDF S3 completata: ${validPdfCount} validi, ${invalidPdfCount} non validi, ${errorCount} errori su ${fileKeys.length} totali.`,
  );

  await validStream.close();
  await invalidStream.close();
  await errorsStream.close();

  return {
    totalChecked: fileKeys.length,
    validPdfCount,
    invalidPdfCount,
    errorCount,
  };
}
