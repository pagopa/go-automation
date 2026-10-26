import { Core } from '@go-automation/go-common';
import { getConfinfoS3Service, getCoreDynamoDBService } from '../utils/awsClients.js';
import type { SendPaperRequestErrorCheckConfig, RetrieveGlacierResult } from '../types/index.js';
import { isNotificationOlderThanOneYear } from './verifyNotification.js';
import { get } from '../utils/get.js';

const NOTIFICATIONS_TABLE_NAME = 'pn-Notifications';

/**
 * Struttura di un elemento da ripristinare da Glacier.
 */
interface GlacierItem {
  readonly iun: string;
  readonly fileKey: string;
  readonly sentAt?: string | undefined;
}

/**
 * Verifica se una chiave file appartiene a un documento AAR (Avviso di Avvenuta Ricezione).
 */
function isAarFileKey(fileKey: string): boolean {
  const upper = fileKey.toUpperCase();
  return upper.includes('AAR') || upper.includes('LEGAL_FACT');
}

/**
 * Legge ed estrae l'elenco degli elementi (IUN, fileKey, sentAt) da file o da array.
 */
function parseGlacierItems(rawItems: ReadonlyArray<string>): GlacierItem[] {
  const result: GlacierItem[] = [];
  for (const rawLine of rawItems) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(',');
    if (parts.length >= 3 && parts[0] && parts[1]) {
      result.push({
        iun: parts[0].trim(),
        fileKey: parts[1].trim(),
        sentAt: parts[2]?.trim(),
      });
    } else if (parts.length === 2 && parts[0] && parts[1]) {
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
  const result = await script.prompt.confirm(
    `⚠️  ATTENZIONE: Si sta per avviare il ripristino da S3 Glacier per ${count} documenti AAR (notifiche > 1 anno).\nVuoi procedere con il restore da Glacier?`,
    false,
  );
  return result ?? false;
}

/**
 * Risolve il nome del bucket S3 SafeStorage se non specificato in configurazione.
 * Usa il profilo Confinfo per elencare i bucket (SafeStorage è nell'account Confinfo).
 */
async function resolveSafestorageBucket(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
  configuredBucket?: string,
): Promise<string> {
  if (configuredBucket) {
    return configuredBucket;
  }
  try {
    const s3Service = getConfinfoS3Service(script, config);
    const buckets = await s3Service.listBuckets();
    const target = buckets.find(
      (b) =>
        b.name !== undefined &&
        !b.name.includes('staging') &&
        (b.name.includes('safestorage') || b.name.includes('safe-storage')),
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
 * Filtra gli elementi Glacier ammettendo SOLO file denominati AAR e con notifica più vecchia di 1 anno.
 */
async function filterGlacierEligibleItems(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
  items: GlacierItem[],
): Promise<GlacierItem[]> {
  const logger = script.logger;
  const eligibleItems: GlacierItem[] = [];

  for (const item of items) {
    // 1. Controllo denominazione AAR
    if (!isAarFileKey(item.fileKey)) {
      logger.warning(`File scartato da Glacier (non è un file AAR): ${item.fileKey}`);
      continue;
    }

    // 2. Controllo età notifica (> 1 anno)
    let sentAt = item.sentAt;
    if (!sentAt && item.iun && item.iun !== 'N/A') {
      try {
        const dynamoDbService = getCoreDynamoDBService(script, config);
        const notifItems = await dynamoDbService.query(NOTIFICATIONS_TABLE_NAME, 'iun = :val', {
          ':val': { S: item.iun },
        });
        if (notifItems.length > 0 && notifItems[0]) {
          sentAt = get<string>(notifItems[0], 'sentAt');
        }
      } catch {
        // Ignora errore query
      }
    }

    if (sentAt) {
      const older1Y = isNotificationOlderThanOneYear(sentAt);
      if (!older1Y) {
        logger.info(
          `IUN ${item.iun}: AAR ${item.fileKey} appartiene a notifica non più vecchia di 1 anno (sentAt: ${sentAt}). Skip Glacier (attivo in S3).`,
        );
        continue;
      }
    }

    eligibleItems.push(item);
  }

  return eligibleItems;
}

/**
 * Esegue il ripristino (RestoreObject) da S3 Glacier per soli documenti AAR di notifiche > 1 anno.
 *
 * @param script - Istanza GOScript
 * @param rawItems - Righe di input contenenti IUN o IUN,fileKey[,sentAt]
 * @returns Risultati dell'operazione di restore da Glacier
 */
export async function retrieveGlacierS3(
  script: Core.GOScript,
  rawItems: ReadonlyArray<string>,
): Promise<RetrieveGlacierResult> {
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const logger = script.logger;
  const s3Service = getConfinfoS3Service(script, config);

  const parsedItems = parseGlacierItems(rawItems);

  if (parsedItems.length === 0) {
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

  // Filtra rigorosamente solo AAR di notifiche > 1 anno
  const glacierItems = await filterGlacierEligibleItems(script, config, parsedItems);

  if (glacierItems.length === 0) {
    logger.info('Nessun file AAR con notifica più vecchia di 1 anno da ripristinare da Glacier. Step completato.');
    return {
      totalItems: 0,
      skippedByUser: false,
      restoredCount: 0,
      alreadyInProgressCount: 0,
      alreadyAvailableCount: 0,
      errorsCount: 0,
    };
  }

  logger.info(`Trovati ${glacierItems.length} file AAR eleggibili per il ripristino da Glacier S3 (> 1 anno).`);

  // Chiede conferma all'utente se non in modalità force / non-interattiva
  if (!config.force) {
    const userConfirmed = await promptUserConfirmation(script, glacierItems.length);
    if (!userConfirmed) {
      logger.info("Ripristino da Glacier annullato dall'utente.");
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

  const bucketName = await resolveSafestorageBucket(script, config, config.bucket);
  const expirationDays = config.glacierExpirationDays ?? 7;
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
      const { httpStatusCode: statusCode } = await s3Service.restoreObject(
        bucketName,
        item.fileKey,
        expirationDays,
        tier,
      );

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
      } else if (errorName === 'ObjectAlreadyInActiveTierError') {
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
