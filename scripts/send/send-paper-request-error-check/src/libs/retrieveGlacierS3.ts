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
 * @param script - Istanza GOScript
 * @param count - Numero di oggetti da ripristinare
 * @returns boolean `true` se l'utente accetta, `false` se rifiuta o annulla
 */
async function promptUserConfirmation(script: Core.GOScript, count: number): Promise<boolean> {
  return script.prompt.confirm(
    `⚠️  ATTENZIONE: Si sta per avviare il ripristino da S3 Glacier per ${count} oggetti.\nVuoi procedere con il restore da Glacier?`,
    false,
  );
}

/**
 * Risolve il nome del bucket S3 SafeStorage se non specificato in configurazione.
 */
async function resolveSafestorageBucket(script: Core.GOScript, configuredBucket?: string): Promise<string> {
  if (configuredBucket) {
    return configuredBucket;
  }
  try {
    const buckets = await script.aws.services.s3.listBuckets();
    const target = buckets.find(
      (b) => b.name?.includes('safestorage') || b.name?.includes('safe-storage') || b.name?.includes('pn-safestorage'),
    );
    if (target?.name) {
      return target.name;
    }
  } catch {
    script.logger.warning('Impossibile elencare i bucket S3, uso bucket predefinito safe-storage');
  }
  return 'pn-safestorage-eu-south-1';
}

/**
 * Esegue il ripristino (RestoreObject) da S3 Glacier per un elenco di fileKey / IUN.
 *
 * @param script - Istanza GOScript
 * @param rawItems - Righe di input contenenti IUN o IUN,fileKey
 * @returns Risultati dell'operazione di restore da Glacier
 */
export async function retrieveGlacierS3(
  script: Core.GOScript,
  rawItems: ReadonlyArray<string>,
): Promise<RetrieveGlacierResult> {
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const logger = script.logger;
  const s3Client = script.aws.clients.s3;

  const glacierItems = parseGlacierItems(rawItems);

  if (glacierItems.length === 0) {
    logger.warning('Nessun elemento valido fornito per il restore da Glacier S3.');
    return {
      totalItems: 0,
      skippedByUser: false,
      restoredCount: 0,
      alreadyInProgressCount: 0,
      alreadyAvailableCount: 0,
      errorsCount: 0,
    };
  }

  logger.info(`Trovati ${glacierItems.length} elementi per il ripristino da Glacier S3.`);

  // Chiede conferma all'utente se non in modalità force / non-interattiva
  if (!config.force) {
    const userConfirmed = await promptUserConfirmation(script, glacierItems.length);
    if (!userConfirmed) {
      logger.info("Ripristino·da·Glacier·annullato·dall'utente.");
      return {
        totalItems: glacierItems.length,
        skippedByUser: true,
        restoredCount: 0,
        alreadyInProgressCount: 0,
        alreadyAvailableCount: 0,
        errorsCount: 0,
      };
    }
  }

  const bucketName = await resolveSafestorageBucket(script, config.bucketName);
  const expirationDays = config.expirationDays ?? 7;
  const tier = config.glacierTier ?? 'Standard';

  logger.info(
    `Avvio restore da Glacier sul bucket [${bucketName}], giorni mantenimento: ${expirationDays}, tier: ${tier}...`,
  );

  let restoredCount = 0;
  let alreadyInProgressCount = 0;
  let alreadyAvailableCount = 0;
  let errorsCount = 0;

  for (let i = 0; i < glacierItems.length; i++) {
    const item = glacierItems[i];
    if (!item) continue;

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
      const errorName = errorObj.name ?? '';

      if (statusCode === 409 || errorName === 'RestoreAlreadyInProgress') {
        logger.info(`ℹ️ IUN ${item.iun}: Restore già in corso (${errorName || 'HTTP 409'})`);
        alreadyInProgressCount++;
      } else if (statusCode === 403 || errorName === 'ObjectAlreadyInActiveTierError') {
        logger.info(`ℹ️ IUN ${item.iun}: Oggetto già disponibile (${errorName || 'HTTP 403'})`);
        alreadyAvailableCount++;
      } else {
        errorsCount++;
        const errorMsg = errorObj.message ?? String(err);
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
