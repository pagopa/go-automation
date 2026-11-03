import { Core } from '@go-automation/go-common';
import { getConfinfoS3Service, getCoreDynamoDBService } from '../utils/awsClients.js';
import type { SendPaperRequestErrorCheckConfig, RetrieveGlacierResult } from '../types/index.js';
import { isNotificationOlderThanOneYear } from './verifyNotification.js';
import { get } from '../utils/get.js';
import { resolveOutputPath } from '../utils/resolveOutputPath.js';

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

interface FilterGlacierResult {
  eligibleItems: GlacierItem[];
  failedItems: GlacierItem[];
  errorCount: number;
}

/**
 * Filtra gli elementi Glacier ammettendo SOLO file denominati AAR e con notifica più vecchia di 1 anno.
 */
async function filterGlacierEligibleItems(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
  items: GlacierItem[],
): Promise<FilterGlacierResult> {
  const logger = script.logger;
  const eligibleItems: GlacierItem[] = [];
  const failedItems: GlacierItem[] = [];
  let errorCount = 0;

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
      } catch (err: unknown) {
        // 🔥 PROPAGAZIONE / CONTEGGIO ERRORE DYNAMODB:
        errorCount++;
        failedItems.push(item);
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`❌ IUN ${item.iun}: Errore DynamoDB durante query ${NOTIFICATIONS_TABLE_NAME}: ${errorMsg}`);
        continue;
      }
    }

    // 3. Verifica sentAt (se non presente ma senza errori di query, es. non trovata)
    if (!sentAt) {
      logger.warning(
        `IUN ${item.iun}: data sentAt non disponibile per AAR ${item.fileKey}. Impossibile confermare età > 1 anno, file scartato dal restore Glacier.`,
      );
      continue;
    }

    // 4. Controllo età > 1 anno
    const older1Y = isNotificationOlderThanOneYear(sentAt);
    if (!older1Y) {
      logger.info(
        `IUN ${item.iun}: AAR ${item.fileKey} appartiene a notifica non più vecchia di 1 anno (sentAt: ${sentAt}). Skip Glacier (attivo in S3).`,
      );
      continue;
    }
    eligibleItems.push(item);
  }

  return { eligibleItems, failedItems, errorCount };
}

async function saveFailedGlacierItems(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
  failedItems: GlacierItem[],
): Promise<void> {
  if (failedItems.length === 0) return;
  try {
    const failedFilePath = resolveOutputPath(script.paths, 'glacier_failed.csv', config.outputDir);
    const exporter = new Core.GOFileListExporter({ outputPath: failedFilePath });
    const lines = ['iun,fileKey', ...failedItems.map((item) => `${item.iun},${item.fileKey}`)];
    await exporter.export(lines);
    script.logger.info(`💾 Elementi Glacier falliti salvati in: ${failedFilePath}`);
  } catch (err) {
    script.logger.warning(`Impossibile salvare il file glacier_failed.csv: ${err instanceof Error ? err.message : String(err)}`);
  }
}

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
  const { eligibleItems, failedItems: filterFailedItems, errorCount: filterErrors } =
    await filterGlacierEligibleItems(script, config, parsedItems);

  let errorsCount = filterErrors;
  const failedItems: GlacierItem[] = [...filterFailedItems];

  // Se nessun elemento è idoneo, verifichiamo se è a causa di errori o semplicemente nessun dato
  if (eligibleItems.length === 0) {
    if (errorsCount > 0) {
      logger.error(`Verifica Glacier terminata con ${errorsCount} errori (nessun file idoneo elaborabile).`);
      await saveFailedGlacierItems(script, config, failedItems);
    } else {
      logger.info('Nessun file AAR con notifica più vecchia di 1 anno da ripristinare da Glacier. Step completato.');
    }
    return {
      totalItems: parsedItems.length,
      skippedByUser: false,
      restoredCount: 0,
      alreadyInProgressCount: 0,
      alreadyAvailableCount: 0,
      errorsCount,
      failedItems,
    };
  }

  // Chiede conferma all'utente se non in modalità force
  if (!config.force) {
    const userConfirmed = await promptUserConfirmation(script, eligibleItems.length);
    if (!userConfirmed) {
      logger.info("Ripristino da Glacier annullato dall'utente.");
      return {
        totalItems: eligibleItems.length,
        skippedByUser: true,
        restoredCount: 0,
        alreadyInProgressCount: 0,
        alreadyAvailableCount: 0,
        errorsCount,
        failedItems,
      };
    }
  }

  const bucketName = await resolveSafestorageBucket(script, config, config.bucket);
  const expirationDays = config.glacierExpirationDays ?? 7;
  const tier = config.glacierTier ?? 'Standard';

  let restoredCount = 0;
  let alreadyInProgressCount = 0;
  let alreadyAvailableCount = 0;

  for (let i = 0; i < eligibleItems.length; i++) {
    const item = eligibleItems[i];
    if (!item) continue;

    try {
      const { httpStatusCode: statusCode } = await s3Service.restoreObject(
        bucketName,
        item.fileKey,
        expirationDays,
        tier,
      );

      if (statusCode === 200 || statusCode === 202) {
        restoredCount++;
      } else if (statusCode === 409) {
        alreadyInProgressCount++;
      } else if (statusCode === 403) {
        alreadyAvailableCount++;
      } else {
        restoredCount++;
      }
    } catch (err: unknown) {
      const errorObj = err as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
      const statusCode = errorObj.$metadata?.httpStatusCode;
      const errorName = errorObj.name ?? '';

      if (statusCode === 409 || errorName === 'RestoreAlreadyInProgress') {
        alreadyInProgressCount++;
      } else if (errorName === 'ObjectAlreadyInActiveTierError') {
        alreadyAvailableCount++;
      } else {
        errorsCount++;
        failedItems.push(item);
        const errorMsg = errorObj.message ?? String(err);
        logger.error(`❌ IUN ${item.iun}: Errore durante restore: ${errorMsg}`);
      }
    }
  }

  // Se ci sono stati elementi falliti (sia da DynamoDB che da S3), esportali
  if (failedItems.length > 0) {
    await saveFailedGlacierItems(script, config, failedItems);
  }

  return {
    totalItems: parsedItems.length,
    skippedByUser: false,
    restoredCount,
    alreadyInProgressCount,
    alreadyAvailableCount,
    errorsCount,
    failedItems,
  };
}
