import fs from 'fs';
import path from 'path';
import { QueryCommand } from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { Core } from '@go-automation/go-common';
import type { SendPaperRequestErrorCheckConfig, CheckFeedbackResult } from '../types/index.js';

/** Nome della tabella DynamoDB delle timeline */
const TIMELINES_TABLE_NAME = 'pn-Timelines';

/**
 * Estrae l'IUN da un requestId fornito.
 * Gestisce i formati:
 * - `PREPARE_ANALOG_DOMICILE.IUN_ABCD-EFGH-1234.ATTEMPT_1`
 * - `SEND_ANALOG_FEEDBACK.IUN_ABCD-EFGH-1234.PCRETRY_0`
 * - `IUN_ABCD-EFGH-1234.PCRETRY_0`
 * - `ABCD-EFGH-1234`
 *
 * @param requestId - Il request ID da elaborare
 * @returns L'IUN estratto
 */
export function extractIunFromRequestId(requestId: string): string {
  const trimmed = requestId.trim();
  if (trimmed.includes('.IUN_')) {
    const afterIun = trimmed.split('.IUN_')[1];
    return afterIun ? afterIun.split('.')[0] ?? trimmed : trimmed;
  }
  if (trimmed.startsWith('IUN_')) {
    const afterIun = trimmed.substring(4);
    return afterIun.split('.')[0] ?? trimmed;
  }
  if (trimmed.includes('IUN_')) {
    const afterIun = trimmed.split('IUN_')[1];
    return afterIun ? afterIun.split('.')[0] ?? trimmed : trimmed;
  }
  return trimmed.split('.')[0] ?? trimmed;
}

/**
 * Utilità di salvataggio/append su file.
 */
function appendToFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(filePath, content + '\n', 'utf8');
}

/**
 * Verifica per ciascun requestId l'esistenza di un evento di feedback in DynamoDB (pn-Timelines).
 *
 * @param script - Istanza di Core.GOScript per accedere ai client e logger
 * @param requestIds - Lista dei requestId da verificare
 * @returns Oggetto CheckFeedbackResult con l'esito delle verifiche
 */
export async function checkFeedbackFromRequestIds(
  script: Core.GOScript,
  requestIds: ReadonlyArray<string>,
): Promise<CheckFeedbackResult> {
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const dynamoDbClient = script.aws.clients.dynamoDB;
  const logger = script.logger;
  const outputDir = config.outputDir || 'results';

  const foundRequestIds: Array<{ requestId: string; event: Record<string, unknown> }> = [];
  const notFoundRequestIds: string[] = [];

  const foundFilePath = path.join(outputDir, 'found.json');
  const notFoundFilePath = path.join(outputDir, 'not_found.txt');

  logger.info(`Inizio verifica feedback su pn-Timelines per ${requestIds.length} requestId...`);

  for (let i = 0; i < requestIds.length; i++) {
    const requestId = requestIds[i]?.trim();
    if (!requestId) continue;

    logger.info(`[${i + 1}/${requestIds.length}] Verifica requestId: ${requestId}`);
    const iun = extractIunFromRequestId(requestId);

    try {
      const command = new QueryCommand({
        TableName: TIMELINES_TABLE_NAME,
        KeyConditionExpression: 'iun = :val',
        ExpressionAttributeValues: {
          ':val': { S: iun },
        },
      });

      const response = await dynamoDbClient.send(command);
      const items: ReadonlyArray<Record<string, AttributeValue>> = response.Items ?? [];

      if (items.length > 0) {
        const partsAfterIun = requestId.includes(iun) ? (requestId.split(iun)[1] ?? '') : '';
        const feedbackSuffix = partsAfterIun.split('.PCRETRY')[0] ?? '';
        const completelyUnreachableSuffix = partsAfterIun.split('.ATTEMPT')[0] ?? '';

        const feedbackString = `SEND_ANALOG_FEEDBACK.IUN_${iun}${feedbackSuffix}`;
        const completelyUnreachableString = `COMPLETELY_UNREACHABLE.IUN_${iun}${completelyUnreachableSuffix}`;

        const feedbackEvent = items.find((item: Record<string, AttributeValue>) => {
          const id = item['timelineElementId']?.S;
          return id === feedbackString || id === completelyUnreachableString;
        });

        if (feedbackEvent) {
          const unmarshalledEvent = unmarshall(feedbackEvent) as Record<string, unknown>;
          logger.info(`✅ Trovato feedback per ${requestId}`);
          foundRequestIds.push({ requestId, event: unmarshalledEvent });
          appendToFile(foundFilePath, JSON.stringify({ [requestId]: unmarshalledEvent }));
        } else {
          logger.warning(`❌ Feedback non trovato per ${requestId}`);
          notFoundRequestIds.push(requestId);
          appendToFile(notFoundFilePath, requestId);
        }
      } else {
        logger.warning(`❌ Nessun elemento timeline trovato per IUN ${iun} (${requestId})`);
        notFoundRequestIds.push(requestId);
        appendToFile(notFoundFilePath, requestId);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Errore durante la query per ${requestId} (IUN: ${iun}): ${errorMsg}`);
      notFoundRequestIds.push(requestId);
      appendToFile(notFoundFilePath, requestId);
    }
  }

  logger.info(
    `Verifica feedback completata: ${foundRequestIds.length} trovati, ${notFoundRequestIds.length} non trovati su ${requestIds.length} totali.`,
  );

  return {
    totalChecked: requestIds.length,
    foundCount: foundRequestIds.length,
    notFoundCount: notFoundRequestIds.length,
    foundRequestIds,
    notFoundRequestIds,
  };
}
