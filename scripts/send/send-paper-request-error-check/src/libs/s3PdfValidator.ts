import fs from 'fs';
import path from 'path';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import type { Core } from '@go-automation/go-common';
import type { SendPaperRequestErrorCheckConfig, PdfValidationResult } from '../types/index.js';

/** Signature Magic Bytes del formato PDF ("%PDF" = 0x25 0x50 0x44 0x46) */
const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46]);

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
 * Converte uno stream di risposta S3 in un Buffer limitato ai primi byte richiesti.
 */
async function streamToBuffer(stream: Readable, maxBytes = 5): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for await (const chunk of stream) {
    const uint8Chunk = chunk instanceof Uint8Array ? chunk : Buffer.from(chunk);
    chunks.push(uint8Chunk);
    totalLength += uint8Chunk.length;
    if (totalLength >= maxBytes) break;
  }

  const concatenated = Buffer.concat(chunks, Math.min(totalLength, maxBytes));
  return concatenated;
}

/**
 * Esito della validazione dei magic bytes di un singolo file S3.
 */
export interface SinglePdfValidationOutcome {
  readonly fileKey: string;
  readonly valid: boolean;
  readonly error?: string | undefined;
}

/**
 * Valida se un oggetto S3 è un PDF valido leggendo solo i primi 5 byte (Range request: bytes=0-4).
 */
async function validatePDFMagicBytes(
  s3Client: S3Client,
  bucket: string,
  fileKey: string,
): Promise<SinglePdfValidationOutcome> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      Range: 'bytes=0-4',
    });

    const response = await s3Client.send(command);
    if (!response.Body) {
      return { fileKey, valid: false, error: 'EmptyResponseBody' };
    }

    const buffer = await streamToBuffer(response.Body as Readable, 5);

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
 */
async function resolveSafestorageBucket(script: Core.GOScript, configuredBucket?: string): Promise<string> {
  if (configuredBucket) return configuredBucket;

  try {
    const buckets = await script.aws.services.s3.listBuckets();
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
  const s3Client = script.aws.clients.s3;
  const logger = script.logger;

  const outputDir = config.outputDir || 'results';

  // Estrazione delle chiavi S3 pulite
  const fileKeys: string[] = [];
  if (inputKeys) {
    for (const line of inputKeys) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // Supporta sia formato semplice 'fileKey' che CSV 'IUN,fileKey'
      const parts = trimmed.split(',');
      const key = parts.length >= 2 ? parts[1]?.trim() : parts[0]?.trim();
      if (key) fileKeys.push(key);
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

  const bucket = await resolveSafestorageBucket(script, config.bucket);
  const concurrency = Math.max(1, config.pdfValidation?.concurrency || 20);

  logger.info(
    `Inizio validazione magic bytes su ${fileKeys.length} oggetti S3 nel bucket [${bucket}] (Concorrenza: ${concurrency})...`,
  );

  const validPdfsFile = path.join(outputDir, 'valid_pdfs.csv');
  const invalidPdfsFile = path.join(outputDir, 'invalid_pdfs.csv');
  const errorsFile = path.join(outputDir, 'pdf_validation_errors.csv');

  appendToFile(validPdfsFile, 'fileKey');
  appendToFile(invalidPdfsFile, 'fileKey,reason');
  appendToFile(errorsFile, 'fileKey,error');

  let validPdfCount = 0;
  let invalidPdfCount = 0;
  let errorCount = 0;

  // Elaborazione a blocchi di concorrenza
  for (let i = 0; i < fileKeys.length; i += concurrency) {
    const batch = fileKeys.slice(i, i + concurrency);
    logger.info(`Validazione batch [${i + 1}-${Math.min(i + concurrency, fileKeys.length)}/${fileKeys.length}]...`);

    const promises = batch.map(async (fileKey) => validatePDFMagicBytes(s3Client, bucket, fileKey));
    const results = await Promise.all(promises);

    for (const res of results) {
      if (res.valid) {
        validPdfCount++;
        appendToFile(validPdfsFile, res.fileKey);
      } else if (res.error === 'InvalidMagicBytes') {
        invalidPdfCount++;
        logger.warning(`❌ PDF Non Valido (Magic Bytes errati): ${res.fileKey}`);
        appendToFile(invalidPdfsFile, `${res.fileKey},InvalidMagicBytes`);
      } else {
        errorCount++;
        logger.error(`⚠️ Errore durante il check del file ${res.fileKey}: ${res.error}`);
        appendToFile(errorsFile, `${res.fileKey},${res.error ?? 'Unknown'}`);
      }
    }
  }

  logger.info(
    `Validazione PDF S3 completata: ${validPdfCount} validi, ${invalidPdfCount} non validi, ${errorCount} errori su ${fileKeys.length} totali.`,
  );

  return {
    totalChecked: fileKeys.length,
    validPdfCount,
    invalidPdfCount,
    errorCount,
  };
}
