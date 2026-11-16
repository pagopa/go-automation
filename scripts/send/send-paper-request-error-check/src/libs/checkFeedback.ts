import type { GOScript } from '@go-automation/go-script';
import { GOFileListExporter } from '@pagopa/go-common/exporters';
import type { SendPaperRequestErrorCheckConfig, CheckFeedbackResult } from '../types/index.js';
import { getCoreDynamoDBService } from '../utils/awsClients.js';
import { extractIun, get } from '../utils/get.js';
import { resolveOutputPath } from '../utils/resolveOutputPath.js';

/** Nome della tabella DynamoDB delle timeline */
const TIMELINES_TABLE_NAME = 'pn-Timelines';

/**
 * Verifica per ciascun requestId l'esistenza di un evento di feedback in DynamoDB (pn-Timelines).
 * Raggruppa per IUN per minimizzare le query a DynamoDB e indicizza gli eventi con Map (O(1)).
 *
 * @param script - Istanza di GOScript per accedere ai client e logger
 * @param requestIds - Lista dei requestId da verificare
 * @returns Oggetto CheckFeedbackResult con l'esito delle verifiche
 */
export async function checkFeedbackFromRequestIds(
  script: GOScript,
  requestIds: ReadonlyArray<string>,
): Promise<CheckFeedbackResult> {
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const dynamoDbService = getCoreDynamoDBService(script, config);
  const logger = script.logger;

  const foundRequestIds: { requestId: string; event: Record<string, unknown> }[] = [];
  const notFoundRequestIds: string[] = [];
  const failedRequestIds: string[] = [];

  const foundFilePath = resolveOutputPath(script.paths, 'found.jsonl', config.outputDir);
  const notFoundFilePath = resolveOutputPath(script.paths, 'not_found.txt', config.outputDir);
  const failedFilePath = resolveOutputPath(script.paths, 'failed.txt', config.outputDir);

  const foundExporter = new GOFileListExporter({ outputPath: foundFilePath });
  const notFoundExporter = new GOFileListExporter({ outputPath: notFoundFilePath });
  const failedExporter = new GOFileListExporter({ outputPath: failedFilePath });
  const foundStream = await foundExporter.exportStream();
  const notFoundStream = await notFoundExporter.exportStream();
  const failedStream = await failedExporter.exportStream();

  // 1️⃣ Raggruppa i requestId per IUN
  const requestsByIun = new Map<string, string[]>();
  for (const raw of requestIds) {
    const requestId = raw?.trim();
    if (!requestId) continue;
    const iun = extractIun(requestId);
    if (!iun) {
      notFoundRequestIds.push(requestId);
      await notFoundStream.append(requestId);
      continue;
    }
    const group = requestsByIun.get(iun);
    if (group) {
      group.push(requestId);
    } else {
      requestsByIun.set(iun, [requestId]);
    }
  }

  logger.info(
    `Inizio verifica feedback su pn-Timelines: ${requestIds.length} requestId raggruppati in ${requestsByIun.size} IUN univoci...`,
  );

  let iunIndex = 0;
  const totalIuns = requestsByIun.size;

  let closeResults: PromiseSettledResult<void>[] | undefined;

  try {
    // 2️⃣ Itera per IUN univoco (1 sola query DynamoDB per IUN)
    for (const [iun, groupedRequestIds] of requestsByIun.entries()) {
      iunIndex++;
      logger.text(`[${iunIndex}/${totalIuns}] Query timeline per IUN: ${iun} (${groupedRequestIds.length} requestId)`);

      try {
        const items = await dynamoDbService.query(TIMELINES_TABLE_NAME, 'iun = :val', {
          ':val': { S: iun },
        });

        if (items.length > 0) {
          // 3️⃣ Indicizza gli eventi della timeline per timelineElementId (lookup O(1))
          const eventsById = new Map<string, Record<string, unknown>>();
          for (const item of items) {
            const elementId = get<string>(item, 'timelineElementId');
            if (elementId) {
              eventsById.set(elementId, item);
            }
          }

          // 4️⃣ Risolve ciascun requestId associato a questo IUN
          for (const requestId of groupedRequestIds) {
            const partsAfterIun = requestId.includes(iun) ? (requestId.split(iun)[1] ?? '') : '';
            const feedbackSuffix = partsAfterIun.split('.PCRETRY')[0] ?? '';
            const completelyUnreachableSuffix = partsAfterIun.split('.ATTEMPT')[0] ?? '';

            const feedbackString = `SEND_ANALOG_FEEDBACK.IUN_${iun}${feedbackSuffix}`;
            const completelyUnreachableString = `COMPLETELY_UNREACHABLE.IUN_${iun}${completelyUnreachableSuffix}`;

            const feedbackEvent = eventsById.get(feedbackString) ?? eventsById.get(completelyUnreachableString);

            if (feedbackEvent) {
              logger.info(`✅ Trovato feedback per ${requestId}`);
              foundRequestIds.push({ requestId, event: feedbackEvent });
              await foundStream.append(JSON.stringify({ [requestId]: feedbackEvent }));
            } else {
              logger.warning(`❌ Feedback non trovato per ${requestId}`);
              notFoundRequestIds.push(requestId);
              await notFoundStream.append(requestId);
            }
          }
        } else {
          logger.warning(`❌ Nessun elemento timeline trovato per IUN ${iun} (${groupedRequestIds.length} requestId)`);
          for (const requestId of groupedRequestIds) {
            notFoundRequestIds.push(requestId);
            await notFoundStream.append(requestId);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`❌ Errore durante la query per IUN ${iun}: ${errorMsg}`);
        for (const requestId of groupedRequestIds) {
          failedRequestIds.push(requestId);
          await failedStream.append(requestId);
        }
      }
    }
  } finally {
    closeResults = await Promise.allSettled([foundStream.close(), notFoundStream.close(), failedStream.close()]);
  }

  const closeErrors = (closeResults ?? [])
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => r.reason as unknown);
  if (closeErrors.length > 0) {
    throw new AggregateError(closeErrors, 'One or more feedback report streams failed to close');
  }

  logger.info(
    `Verifica feedback completata: ${foundRequestIds.length} trovati, ${notFoundRequestIds.length} non trovati, ${failedRequestIds.length} falliti su ${requestIds.length} totali.`,
  );

  return {
    totalChecked: requestIds.length,
    foundCount: foundRequestIds.length,
    notFoundCount: notFoundRequestIds.length,
    failedCount: failedRequestIds.length,
    foundRequestIds,
    notFoundRequestIds,
    failedRequestIds,
  };
}
