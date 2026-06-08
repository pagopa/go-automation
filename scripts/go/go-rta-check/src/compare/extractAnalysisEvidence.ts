import type { AlarmAnalysisDto } from '../types/WatchtowerDtos.js';
import { normalize } from './text.js';

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

/**
 * Concatenates and normalizes the analysis fields relevant to the comparison.
 *
 * @param analysis - The Watchtower analysis
 * @returns The aggregate evidence
 */
export function extractAnalysisEvidence(analysis: AlarmAnalysisDto): AnalysisEvidence {
  const parts: string[] = [];
  if (analysis.errorDetails !== null && analysis.errorDetails.trim() !== '') parts.push(analysis.errorDetails);
  if (analysis.conclusionNotes !== null && analysis.conclusionNotes.trim() !== '') parts.push(analysis.conclusionNotes);
  for (const entry of analysis.trackingIds) {
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
    traceIds: analysis.trackingIds.map((entry) => entry.traceId).filter((id) => id.trim() !== ''),
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
  const target = new Date(firedAt).getTime();
  let bestDetail: string | undefined;
  let bestDiff = Number.POSITIVE_INFINITY;

  if (!Number.isNaN(target)) {
    for (const entry of analysis.trackingIds) {
      if (entry.timestamp === undefined) continue;
      const ts = new Date(entry.timestamp).getTime();
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
