import fs from 'fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { RestoreObjectCommand } from '@aws-sdk/client-s3';
import type { Core } from '@go-automation/go-common';
import type { SendPaperRequestErrorCheckConfig, RetrieveGlacierResult } from '../types/index.js';

/**
 * Struttura di un elemento da ripristinare da Glacier.
 */
export interface GlacierItem {
  readonly iun: string;
  readonly fileKey: string;
}

/**
 * Legge ed estrae l'elenco degli elementi (IUN, fileKey) da file o da array.
 */
export function parseGlacierItems(rawItems: ReadonlyArray<string>): GlacierItem[] {
  const result: GlacierItem[] = [];
  for (const rawLine of rawItems) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(',');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      result.push({
        iun: parts[0].trim(),
        fileKey: parts[1].trim(),
      });
    } else if (parts[0]) {
      result.push({
        iun: 'N/A',
        fileKey: parts[0].trim(),
      });
    }
  }
  return result;
}

/**
 * Chiede la conferma interattiva all'utente prima di avviare le operazioni sul Glacier.
 *
 * @param count - Numero di oggetti da ripristinare
 * @returns boolean `true` se l'utente accetta, `false` se rifiuta o annulla
 */
async function promptUserConfirmation(count: number): Promise<boolean> {
  // Se non si dispone di TTY o input interattivo
  if (!input.isTTY) {
    return false;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const questionText = `\n⚠️  ATTENZIONE: Si sta per avviare il ripristino da S3 Glacier per ${count} oggetti.\nVuoi procedere con il restore da Glacier? (s/N): `;
    const answer = await rl.question(questionText);
    const trimmed = answer.trim().toLowerCase();
    return trimmed === 's' || trimmed === 'si' || trimmed === 'sì' || trimmed === 'y' || trimmed === 'yes';
  } catch {
    return false;
  } finally {
    rl.close();
  }
}

/**
 * Risolve il nome del bucket S3 SafeStorage se non specificato in configurazione.
 */
async function resolveSafestorageBucket(
  script: Core.GOScript,
  configuredBucket?: string,
): Promise<string> {
  if (configuredBucket) {
    return configuredBucket;
  }

  try {
    const buckets = await script.aws.services.s3.listBuckets();
    const target = buckets.find(
      (b) => b.name && b.name.includes('safestorage') && !b.name.includes('staging'),
    );

    if (target?.name) {
      return target.name;
    }
  } catch {
    // Fallback in caso di errore nella lista bucket
  }

  return 'pn-safestorage-eu-south-1';
}

/**
 * Modulo per il recupero massivo degli oggetti archiviati su S3 Glacier.
 * Richiede conferma esplicita dell'utente prima di effettuare le richieste di restore.
 *
 * @param script - Istanza di Core.GOScript per accedere ai client AWS ed al logger
 * @param inputItems - Elenco opzionale di righe 'IUN,fileKey' o chiavi S3
 * @returns Risultati dell'operazione di restore da Glacier
 */
export async function retrieveGlacierS3(
  script: Core.GOScript,
  inputItems?: ReadonlyArray<string>,
): Promise<RetrieveGlacierResult> {
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const s3Client = script.aws.clients.s3;
  const logger = script.logger;

  // Caricamento item da inputItems o da file di configurazione
  let rawLines: string[] = [];
  if (inputItems && inputItems.length > 0) {
    rawLines = [...inputItems];
  } else if (config.inputFile && fs.existsSync(config.inputFile)) {
    const fileContent = fs.readFileSync(config.inputFile, { encoding: 'utf8' });
    rawLines = fileContent.split('\n');
  }

  const glacierItems = parseGlacierItems(rawLines);

  if (glacierItems.length === 0) {
    logger.warning('Nessun elemento valido trovato per il ripristino da Glacier.');
    return {
      totalItems: 0,
      skippedByUser: false,
      restoredCount: 0,
      alreadyInProgressCount: 0,
      alreadyAvailableCount: 0,
      errorsCount: 0,
    };
  }

  logger.info(`Trovati ${glacierItems.length} elementi per il controllo/restore Glacier.`);

  // Controllo di conferma utente
  const userConfirmed = await promptUserConfirmation(glacierItems.length);

  if (!userConfirmed) {
    logger.info('🛑 Ripristino da S3 Glacier annullato dall\'utente (scelta: "No"). Si passa al passaggio successivo.');
    return {
      totalItems: glacierItems.length,
      skippedByUser: true,
      restoredCount: 0,
      alreadyInProgressCount: 0,
      alreadyAvailableCount: 0,
      errorsCount: 0,
    };
  }

  const bucketName = await resolveSafestorageBucket(script, config.bucket);
  const expirationDays = config.glacier?.expirationDays ?? 30;
  const tier = config.glacier?.tier ?? 'Bulk';

  logger.info(`Inizio restore Glacier sul bucket [${bucketName}] (Expiration: ${expirationDays} giorni, Tier: ${tier})...`);

  let restoredCount = 0;
  let alreadyInProgressCount = 0;
  let alreadyAvailableCount = 0;
  let errorsCount = 0;

  for (let i = 0; i < glacierItems.length; i++) {
    const item = glacierItems[i]!;
    logger.info(`[${i + 1}/${glacierItems.length}] Invio richiesta restore per IUN ${item.iun} (Key: ${item.fileKey})`);

    try {
      const command = new RestoreObjectCommand({
        Bucket: bucketName,
        Key: item.fileKey,
        RestoreRequest: {
          Days: expirationDays,
          GlacierJobParameters: {
            Tier: tier,
          },
        },
      });

      const response = await s3Client.send(command);
      const statusCode = response.$metadata?.httpStatusCode;

      if (statusCode === 200 || statusCode === 202) {
        logger.info(`✅ IUN ${item.iun}: Retrieve avviato con successo (HTTP ${statusCode})`);
        restoredCount++;
      } else if (statusCode === 409) {
        logger.info(`ℹ️ IUN ${item.iun}: Restore già in corso (HTTP 409)`);
        alreadyInProgressCount++;
      } else if (statusCode === 403) {
        logger.info(`ℹ️ IUN ${item.iun}: Oggetto già disponibile in Active Tier (HTTP 403)`);
        alreadyAvailableCount++;
      } else {
        logger.info(`✅ IUN ${item.iun}: Risposta ricevuta (HTTP ${statusCode ?? 'UNKNOWN'})`);
        restoredCount++;
      }
    } catch (err: unknown) {
      const errorObj = err as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
      const statusCode = errorObj.$metadata?.httpStatusCode;
      const errorName = errorObj.name || '';

      if (statusCode === 409 || errorName === 'RestoreAlreadyInProgress') {
        logger.info(`ℹ️ IUN ${item.iun}: Restore già in corso (${errorName || 'HTTP 409'})`);
        alreadyInProgressCount++;
      } else if (statusCode === 403 || errorName === 'ObjectAlreadyInActiveTierError') {
        logger.info(`ℹ️ IUN ${item.iun}: Oggetto già disponibile (${errorName || 'HTTP 403'})`);
        alreadyAvailableCount++;
      } else {
        errorsCount++;
        const errorMsg = errorObj.message || String(err);
        logger.error(`❌ IUN ${item.iun}: Errore durante la richiesta di restore: ${errorMsg}`);
      }
    }
  }

  logger.info(
    `Ripristino da Glacier completato: ${restoredCount} avviati, ${alreadyInProgressCount} in corso, ${alreadyAvailableCount} già disponibili, ${errorsCount} errori su ${glacierItems.length} totali.`,
  );

  return {
    totalItems: glacierItems.length,
    skippedByUser: false,
    restoredCount,
    alreadyInProgressCount,
    alreadyAvailableCount,
    errorsCount,
  };
}

