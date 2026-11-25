import type { GOScript } from '@go-automation/go-script';
import { GOFileListExporter, GOJSONListExporter } from '@pagopa/go-common/exporters';
import type { SendPaperRequestErrorCheckConfig, VerifyPcRetryResult } from '../types/index.js';
import { getConfinfoDynamoDBService } from '../utils/awsClients.js';
import { get } from '../utils/get.js';
import { resolveOutputPath } from '../utils/resolveOutputPath.js';

const EC_RICHIESTE_METADATI_TABLE = 'pn-EcRichiesteMetadati';
const CLIENT_ID_PREFIX = 'pn-cons-000~';
const DEFAULT_CLEANUP_STATUSES = new Set(['error', 'internalError']);

/**
 * Normalizza un requestId rimuovendo eventuali prefissi di errore (es. `SAFE_STORAGE_ERROR - `)
 * ed eventuali suffissi `.PCRETRY_<n>` preesistenti.
 */
function normalizeBaseRequestId(rawRequestId: string): string {
  let cleaned = rawRequestId.trim();
  const dashIndex = cleaned.indexOf(' - ');
  if (dashIndex !== -1) {
    cleaned = cleaned.slice(dashIndex + 3).trim();
  }
  return cleaned.replace(/\.PCRETRY_\d+$/, '');
}

/**
 * Verifica progressivamente i suffissi `.PCRETRY_0`, `.PCRETRY_1`, ... sulla tabella DynamoDB
 * `pn-EcRichiesteMetadati` (account confinfo) senza effettuare alcuna risottomissione.
 *
 * Logica per ciascun requestId:
 * - Parte da idx = 0 (`<baseRequestId>.PCRETRY_0`).
 * - Se non trovato su DynamoDB: questo PCRETRY è pronto/da risottomettere (`toResubmit`).
 * - Se trovato e in stato oggetto di pulizia (`error` / `internalError`): incrementa idx e continua.
 * - Se trovato e in altro stato (senza errori): già gestito/in corso/completato -> scarta (`discarded`).
 *
 * @param script - Istanza GOScript
 * @param requestIds - Elenco dei requestId da verificare
 * @returns Esito della verifica PCRETRY
 */
export async function verifyPcRetry(
  script: GOScript,
  requestIds: ReadonlyArray<string>,
): Promise<VerifyPcRetryResult> {
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const dynamoDbService = getConfinfoDynamoDBService(script, config);
  const logger = script.logger;

  const uniqueBaseIds = new Set<string>();
  for (const raw of requestIds) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const baseId = normalizeBaseRequestId(trimmed);
    if (baseId) {
      uniqueBaseIds.add(baseId);
    }
  }

  const baseIdList = Array.from(uniqueBaseIds);
  const toResubmitRequestIds: string[] = [];
  const discardedItems: { requestId: string; checkedRequestId: string; status: string }[] = [];
  const statusCounters: Record<string, number> = {};
  let errorsCount = 0;

  if (baseIdList.length === 0) {
    logger.warning('Nessun requestId valido fornito per la verifica PCRETRY.');
    return {
      totalChecked: 0,
      toResubmitCount: 0,
      discardedCount: 0,
      errorsCount: 0,
      toResubmitRequestIds: [],
      discardedItems: [],
      statusCounters: {},
    };
  }

  logger.info(
    `Inizio verifica PCRETRY su ${EC_RICHIESTE_METADATI_TABLE} (account confinfo) per ${baseIdList.length} requestId univici...`,
  );

  for (let i = 0; i < baseIdList.length; i++) {
    const baseId = baseIdList[i];
    if (!baseId) continue;

    logger.text(`[${i + 1}/${baseIdList.length}] Verifica PCRETRY per: ${baseId}`);

    let idx = 0;
    while (true) {
      const testRequestId = `${baseId}.PCRETRY_${idx}`;
      try {
        const items = await dynamoDbService.query(EC_RICHIESTE_METADATI_TABLE, 'requestId = :val', {
          ':val': { S: `${CLIENT_ID_PREFIX}${testRequestId}` },
        });

        if (items.length === 0) {
          logger.info(`✅ ${testRequestId}: non presente su ${EC_RICHIESTE_METADATI_TABLE} → da risottomettere.`);
          toResubmitRequestIds.push(testRequestId);
          break;
        }

        const metadata = items[0];
        const statusRequest = get<string>(metadata, 'statusRequest', 'UNKNOWN');
        statusCounters[statusRequest] = (statusCounters[statusRequest] ?? 0) + 1;

        if (DEFAULT_CLEANUP_STATUSES.has(statusRequest)) {
          // Continue only up to the maximum allowed retry index (3)
          if (idx < 3) {
            logger.text(`↻ ${testRequestId}: stato "${statusRequest}" (pulizia), controllo PCRETRY_${idx + 1}...`);
            idx += 1;
            continue;
          }
          // Reached the maximum retry index (3); stop iterating for this baseId.
          logger.text(`⚠️ ${testRequestId}: stato "${statusRequest}" (pulizia) e raggiunto limite PCRETRY 3 → interrompo.`);
          break;
        }

        logger.info(`⏭️  ${testRequestId}: stato "${statusRequest}" (senza errori) → scartato.`);
        discardedItems.push({
          requestId: baseId,
          checkedRequestId: testRequestId,
          status: statusRequest,
        });
        break;
      } catch (err: unknown) {
        errorsCount++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`❌ Errore DynamoDB durante query ${testRequestId} su ${EC_RICHIESTE_METADATI_TABLE}: ${errorMsg}`);
        break;
      }
    }
  }

  // Esportazione file di output
  const toResubmitPath = resolveOutputPath(script.paths, 'pcretry_to_resubmit.txt', config.outputDir);
  const toResubmitExporter = new GOFileListExporter({ outputPath: toResubmitPath });
  await toResubmitExporter.export(toResubmitRequestIds);

  const discardedPath = resolveOutputPath(script.paths, 'pcretry_discarded.csv', config.outputDir);
  const discardedLines = [
    'baseRequestId,checkedRequestId,statusRequest',
    ...discardedItems.map((item) => `"${item.requestId}","${item.checkedRequestId}","${item.status}"`),
  ];
  const discardedExporter = new GOFileListExporter({ outputPath: discardedPath });
  await discardedExporter.export(discardedLines);

  const statsPath = resolveOutputPath(script.paths, 'pcretry_stats.json', config.outputDir);
  const statsExporter = new GOJSONListExporter({ outputPath: statsPath, jsonl: false });
  await statsExporter.export([
    {
      totalChecked: baseIdList.length,
      toResubmitCount: toResubmitRequestIds.length,
      discardedCount: discardedItems.length,
      errorsCount,
      statusCounters,
    },
  ]);

  logger.info(
    `Verifica PCRETRY completata: ${toResubmitRequestIds.length} da risottomettere (${toResubmitPath}), ${discardedItems.length} scartati (${discardedPath}), ${errorsCount} errori.`,
  );

  return {
    totalChecked: baseIdList.length,
    toResubmitCount: toResubmitRequestIds.length,
    discardedCount: discardedItems.length,
    errorsCount,
    toResubmitRequestIds,
    discardedItems,
    statusCounters,
  };
}
