import fs from 'fs';
import path from 'path';
import type { Core } from '@go-automation/go-common';
import type { SendPaperRequestErrorCheckConfig, FetchTimelinesResult } from '../types/index.js';
import { get } from '../utils/get.js';

/** Nome della tabella DynamoDB delle timeline */
const TIMELINES_TABLE_NAME = 'pn-Timelines';

/**
 * Struttura di un elemento di timeline estratto.
 */
export interface TimelineElement {
  readonly timelineElementId: string;
  readonly category: string;
  readonly timestamp: string;
  readonly details?: Record<string, unknown> | undefined;
}

/**
 * Struttura del documento timeline per una notifica IUN.
 */
export interface IunTimelineDocument {
  readonly iun: string;
  readonly paId?: string | undefined;
  readonly notificationSentAt?: string | undefined;
  readonly timeline: TimelineElement[];
}

/**
 * Estrae l'IUN pulito eliminando prefissi e suffissi.
 */
export function extractCleanIun(line: string): string {
  let cleaned = line.trim();
  if (cleaned.includes('IUN_')) {
    cleaned = cleaned.split('IUN_')[1]?.split('.RECINDEX')[0] ?? cleaned;
  }
  if (cleaned.includes('|')) {
    cleaned = cleaned.split('|')[0] ?? cleaned;
  }
  return cleaned.trim();
}

/**
 * Scarica le timeline da DynamoDB per una lista di IUN e salva il risultato in `timelines.json`.
 *
 * @param script - Istanza GOScript
 * @param iunsInput - Elenco di IUN o righe di file da elaborare
 * @returns Risultati dell'estrazione timeline
 */
export async function fetchTimelines(
  script: Core.GOScript,
  iunsInput?: ReadonlyArray<string>,
): Promise<FetchTimelinesResult> {
  const config = await script.getConfiguration<SendPaperRequestErrorCheckConfig>();
  const dynamoDbService = script.aws.services.dynamoDB;
  const logger = script.logger;

  const outputDir = config.outputDir || 'results';

  // Estrazione lista univoca di IUN
  const iunSet = new Set<string>();
  if (iunsInput) {
    for (const rawLine of iunsInput) {
      const iun = extractCleanIun(rawLine);
      if (iun) iunSet.add(iun);
    }
  }

  const iuns = Array.from(iunSet);

  if (iuns.length === 0) {
    logger.warning('Nessun IUN valido fornito per lo scaricamento delle timeline.');
    return {
      totalIuns: 0,
      timelinesFetchedCount: 0,
      emptyTimelinesCount: 0,
      errorsCount: 0,
    };
  }

  logger.info(`Inizio scaricamento timeline da DynamoDB per ${iuns.length} IUN univoci...`);

  const timelinesResult: IunTimelineDocument[] = [];
  let timelinesFetchedCount = 0;
  let emptyTimelinesCount = 0;
  let errorsCount = 0;

  for (let i = 0; i < iuns.length; i++) {
    const iun = iuns[i]!;
    if ((i + 1) % 50 === 0 || i === 0 || i === iuns.length - 1) {
      logger.info(`[${i + 1}/${iuns.length}] Query timeline per IUN: ${iun}`);
    }

    try {
      const items = await dynamoDbService.query(TIMELINES_TABLE_NAME, 'iun = :val', {
        ':val': { S: iun },
      });

      if (items.length === 0) {
        emptyTimelinesCount++;
        timelinesResult.push({ iun, timeline: [] });
        continue;
      }

      timelinesFetchedCount++;
      const firstItem = items[0]!;
      const paId = get<string>(firstItem, 'paId');

      let notificationSentAt: string | undefined;
      const timelineElements: TimelineElement[] = [];

      for (const itemObj of items) {
        if (!notificationSentAt) {
          notificationSentAt = get<string>(itemObj, 'notificationSentAt');
        }

        const timelineElementId = get<string>(itemObj, 'timelineElementId', '');
        const category = get<string>(itemObj, 'category', '');
        const timestamp = get<string>(itemObj, 'timestamp', '');
        const details = get<Record<string, unknown>>(itemObj, 'details');

        if (timelineElementId) {
          timelineElements.push({
            timelineElementId,
            category,
            timestamp,
            details,
          });
        }
      }

      // Ordina gli eventi di timeline per timestamp crescente
      timelineElements.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      timelinesResult.push({
        iun,
        paId,
        notificationSentAt,
        timeline: timelineElements,
      });
    } catch (err: unknown) {
      errorsCount++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Errore nel recupero della timeline per IUN ${iun}: ${errorMsg}`);
    }
  }

  // Scrittura del file JSON di output
  const destinationFile = path.join(outputDir, 'timelines.json');
  const dir = path.dirname(destinationFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(destinationFile, JSON.stringify(timelinesResult, null, 2), 'utf8');

  logger.info(
    `Scaricamento timeline completato: ${timelinesFetchedCount} trovate, ${emptyTimelinesCount} vuote, ${errorsCount} errori. File salvato in [${destinationFile}].`,
  );

  return {
    totalIuns: iuns.length,
    timelinesFetchedCount,
    emptyTimelinesCount,
    errorsCount,
  };
}

