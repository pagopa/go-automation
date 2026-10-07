import * as fs from 'fs';

export interface TimelineEvent {
  category?: string;
  timestamp?: string;
  timelineElementId?: string;
}

export interface JsonItem {
  iun?: string;
  timeline?: TimelineEvent[];
  [key: string]: unknown;
}

export interface ExclusionCheckResult {
  readonly excluded: boolean;
  readonly reason?: 'CANCELLED' | 'VIEWED_OVER_120D' | 'REFINEMENT_OVER_120D' | undefined;
  readonly eventTimestamp?: string | undefined;
}

const REGEX_IUN_PATTERN = /(?:\w{4}-){3}\d{6}-\w-\d/;

/**
 * Calcola se una data (in formato ISO string o Date) è più vecchia di 1 anno (365 giorni) rispetto a oggi.
 *
 * @param sentAt - Stringa data ISO
 * @param referenceDate - Data di riferimento opzionale (default: now)
 * @returns boolean `true` se la notifica è stata inviata più di 1 anno fa
 */
export function isNotificationOlderThanOneYear(sentAt?: string, referenceDate: Date = new Date()): boolean {
  if (!sentAt) return false;
  const sentDate = new Date(sentAt);
  if (isNaN(sentDate.getTime())) return false;

  const oneYearAgo = new Date(referenceDate);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return sentDate.getTime() < oneYearAgo.getTime();
}

/**
 * Calcola la data limite a 120 giorni nel passato rispetto alla data di riferimento.
 *
 * @param referenceDate - Data di riferimento opzionale (default: now)
 * @returns Stringa ISO in formato YYYY-MM-DD o ISO string
 */
export function get120DaysThresholdIso(referenceDate: Date = new Date()): string {
  const threshold = new Date(referenceDate);
  threshold.setDate(threshold.getDate() - 120);
  return threshold.toISOString();
}

/**
 * Verifica se una notifica deve essere SCARTATA dal controllo allegati in base alla timeline.
 * Criteri di scarto:
 * 1. Presenta un evento NOTIFICATION_CANCELLED
 * 2. Presenta un evento NOTIFICATION_VIEWED antecedente al limite temporale (es. > 120 giorni)
 * 3. Presenta un evento REFINEMENT antecedente al limite temporale (es. > 120 giorni)
 *
 * Se scartata, gli allegati hanno il delete marker o sono annullati (non va fatto nulla).
 * Se NON scartata, gli allegati vanno verificati con lo step PDF.
 *
 * @param timeline - Elenco eventi di timeline
 * @param timestampThreshold - Stringa ISO limite (es. data di 120 giorni fa)
 * @returns ExclusionCheckResult indicante se è scartata e la motivazione
 */
export function isNotificationExcluded(
  timeline?: ReadonlyArray<TimelineEvent>,
  timestampThreshold: string = get120DaysThresholdIso(),
): ExclusionCheckResult {
  if (!timeline || timeline.length === 0) {
    // Senza timeline o in corso: non scartata
    return { excluded: false };
  }

  for (const event of timeline) {
    const { category, timestamp } = event;
    if (!category) continue;

    // 1. NOTIFICATION_CANCELLED
    if (category === 'NOTIFICATION_CANCELLED') {
      return {
        excluded: true,
        reason: 'CANCELLED',
        eventTimestamp: timestamp,
      };
    }

    // 2. NOTIFICATION_VIEWED antecedente alla soglia (vecchia oltre 120 giorni)
    if (category === 'NOTIFICATION_VIEWED' && timestamp !== undefined && timestamp < timestampThreshold) {
      return {
        excluded: true,
        reason: 'VIEWED_OVER_120D',
        eventTimestamp: timestamp,
      };
    }

    // 3. REFINEMENT antecedente alla soglia (vecchia oltre 120 giorni)
    if (category === 'REFINEMENT' && timestamp !== undefined && timestamp < timestampThreshold) {
      return {
        excluded: true,
        reason: 'REFINEMENT_OVER_120D',
        eventTimestamp: timestamp,
      };
    }
  }

  return { excluded: false };
}

/**
 * Elabora un array di oggetti timeline in memoria, estrae le notifiche scartate su file
 * e restituisce l'elenco delle notifiche NON scartate (mantenute per i controlli).
 *
 * @param data - Array di documenti timeline
 * @param timestampThreshold - Limite temporale ISO (es. 120 giorni fa)
 * @returns Array con i soli documenti che non sono stati scartati dal filtro
 */
export function processTimelines<
  T extends { readonly iun?: string | undefined; readonly timeline?: ReadonlyArray<TimelineEvent> | undefined },
>(data: ReadonlyArray<T>, timestampThreshold: string): T[] {
  console.log(`Elaborazione timeline con limite temporale 120gg: ${timestampThreshold}`);

  const cancelledOutput: string[] = [];
  const viewedOutput: string[] = [];
  const refinementOutput: string[] = [];
  const keptItems: T[] = [];

  for (const item of data) {
    const timeline = item.timeline;
    if (!timeline || !Array.isArray(timeline)) {
      keptItems.push(item);
      continue;
    }

    const check = isNotificationExcluded(timeline, timestampThreshold);

    if (check.excluded) {
      let idToReport = item.iun;
      for (const ev of timeline) {
        if (ev.timelineElementId) {
          const match = ev.timelineElementId.match(REGEX_IUN_PATTERN);
          if (match?.[0]) {
            idToReport = match[0];
            break;
          }
        }
      }

      if (check.reason === 'CANCELLED') {
        cancelledOutput.push(idToReport || 'UNKNOWN');
      } else if (check.reason === 'VIEWED_OVER_120D') {
        viewedOutput.push(idToReport || 'UNKNOWN');
      } else if (check.reason === 'REFINEMENT_OVER_120D') {
        refinementOutput.push(idToReport || 'UNKNOWN');
      }
    } else {
      keptItems.push(item);
    }
  }

  try {
    const formatOutput = (arr: string[]) => (arr.length > 0 ? `${arr.join('\n')}\n` : '');

    fs.writeFileSync('NOTIFICATION_CANCELLED.txt', formatOutput(cancelledOutput));
    fs.writeFileSync('NOTIFICATION_VIEWED.txt', formatOutput(viewedOutput));
    fs.writeFileSync('REFINEMENT.txt', formatOutput(refinementOutput));

    console.log(
      `Filtro completato: ${cancelledOutput.length} CANCELLED, ${viewedOutput.length} VIEWED (>120gg), ${refinementOutput.length} REFINEMENT (>120gg) scartate. Mantenute: ${keptItems.length}.`,
    );
  } catch (error) {
    console.error('Errore durante il salvataggio dei file di report filtro:', error);
  }

  return keptItems;
}
