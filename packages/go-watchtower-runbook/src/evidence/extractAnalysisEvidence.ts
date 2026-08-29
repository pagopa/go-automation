import type { AlarmAnalysisDto } from '@go-automation/go-watchtower-client';
import { normalize } from '../comparison/text.js';

const OCCURRENCE_TRACKING_MAX_DISTANCE_MS = 10 * 60 * 1000;

interface AnalysisTrackingEntry {
  readonly errorCode?: string;
  readonly errorDetail?: string;
  readonly timestamp?: string;
  readonly traceId: string;
}

/** Aggregate textual evidence extracted from a Watchtower analysis. */
export interface AnalysisEvidence {
  /** Concatenated free text (error details, notes, tracking details, names). */
  readonly text: string;
  /** Normalized form of {@link AnalysisEvidence.text}. */
  readonly normalizedText: string;
  /** Trace ids declared in the analysis (`trackingIds[].traceId`). */
  readonly traceIds: ReadonlyArray<string>;
  /** Downstream microservice names referenced by the analysis. */
  readonly downstreamNames: ReadonlyArray<string>;
}

/** Parses Watchtower timestamps without an explicit zone as UTC. */
function parseWatchtowerTimestamp(value: string): number {
  const timestamp = value.trim();
  const hasTime = /[T ]\d{2}:\d{2}/.test(timestamp);
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp);
  const normalized = hasTime && !hasZone ? `${timestamp.replace(' ', 'T')}Z` : timestamp;
  return Date.parse(normalized);
}

/** Tracking evidence that can safely be associated with one occurrence. */
function occurrenceTrackingEntries(
  analysis: AlarmAnalysisDto,
  firedAt: string | undefined,
): ReadonlyArray<AnalysisTrackingEntry> {
  if (firedAt === undefined) return analysis.trackingIds;

  const target = parseWatchtowerTimestamp(firedAt);
  if (Number.isNaN(target)) return analysis.trackingIds;

  const isSingleOccurrence = analysis.occurrences <= 1 && analysis.linkedEventsCount <= 1;
  return analysis.trackingIds.filter((entry) => {
    if (entry.timestamp === undefined) return isSingleOccurrence;
    const timestamp = parseWatchtowerTimestamp(entry.timestamp);
    return !Number.isNaN(timestamp) && Math.abs(timestamp - target) <= OCCURRENCE_TRACKING_MAX_DISTANCE_MS;
  });
}

/**
 * Concatenates and normalizes the analysis fields relevant to the comparison.
 *
 * @param analysis - The Watchtower analysis
 * @param firedAt - Optional occurrence timestamp used to scope tracking ids
 * @returns The aggregate evidence
 */
export function extractAnalysisEvidence(analysis: AlarmAnalysisDto, firedAt?: string): AnalysisEvidence {
  const trackingEntries = occurrenceTrackingEntries(analysis, firedAt);
  const parts: string[] = [];
  if (analysis.errorDetails !== null && analysis.errorDetails.trim() !== '') parts.push(analysis.errorDetails);
  if (analysis.conclusionNotes !== null && analysis.conclusionNotes.trim() !== '') parts.push(analysis.conclusionNotes);
  for (const entry of trackingEntries) {
    if (entry.errorCode !== undefined && entry.errorCode.trim() !== '') parts.push(entry.errorCode);
    if (entry.errorDetail !== undefined && entry.errorDetail.trim() !== '') parts.push(entry.errorDetail);
  }
  for (const downstream of analysis.downstreams) parts.push(downstream.name);
  for (const resource of analysis.resources) parts.push(resource.name);
  for (const action of analysis.finalActions) parts.push(action.name);

  const text = parts.join('\n');
  return {
    text,
    normalizedText: normalize(text),
    traceIds: trackingEntries.map((entry) => entry.traceId).filter((id) => id.trim() !== ''),
    downstreamNames: analysis.downstreams.map((downstream) => downstream.name),
  };
}

/**
 * Picks the reference text for a specific occurrence: the `trackingIds` entry
 * whose `timestamp` is closest to `firedAt`, falling back to the aggregate
 * `errorDetails` / `conclusionNotes`.
 *
 * @param analysis - The Watchtower analysis
 * @param firedAt - The occurrence timestamp (ISO 8601)
 * @returns The per-occurrence excerpt (possibly empty)
 */
export function pickOccurrenceExcerpt(analysis: AlarmAnalysisDto, firedAt: string): string {
  const target = parseWatchtowerTimestamp(firedAt);
  let bestDetail: string | undefined;
  let bestDiff = Number.POSITIVE_INFINITY;

  if (!Number.isNaN(target)) {
    for (const entry of occurrenceTrackingEntries(analysis, firedAt)) {
      if (entry.timestamp === undefined) continue;
      const ts = parseWatchtowerTimestamp(entry.timestamp);
      if (Number.isNaN(ts)) continue;
      const detail = [entry.errorCode, entry.errorDetail]
        .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        .join(' — ');
      const diff = Math.abs(ts - target);
      if (detail !== '' && diff < bestDiff) {
        bestDiff = diff;
        bestDetail = detail;
      }
    }
  }

  if (bestDetail !== undefined) return bestDetail;
  return analysis.errorDetails ?? analysis.conclusionNotes ?? '';
}
