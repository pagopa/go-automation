import type { RunbookOutput } from '@pagopa/go-runbook/output';

import type { AlarmAnalysisDto } from '@go-automation/go-watchtower-client';
import type { AnalysisMatch, AnalysisMatchSignals, RunbookCheck, V2Status } from '../types/RtaCheckReport.js';
import { extractAnalysisEvidence, pickOccurrenceExcerpt } from '../evidence/extractAnalysisEvidence.js';
import { resolveOccurrenceEvidenceWindow } from '../evidence/resolveOccurrenceEvidenceWindow.js';
import { analysisTraceMatcher } from '../evidence/analysisTraceMatcher.js';
import { matchedKeywordCategories } from './synonyms.js';
import { normalize, tokenDice } from './text.js';
import type { DetectedCase } from './DetectedCase.js';

/** Options controlling which analyses are usable as comparison oracle. */
export interface MatchAnalysisOptions {
  readonly includeIgnorable: boolean;
  readonly includeIncomplete: boolean;
}

/** Correlation ids (requestId / traceId) surfaced by the runbook output. */
function correlationIds(output: RunbookOutput): ReadonlyArray<string> {
  const ids = new Set<string>();
  for (const field of output.context.fields) {
    const key = `${field.name} ${field.label}`.toLowerCase();
    if ((key.includes('requestid') || key.includes('trace')) && field.value.trim() !== '') {
      ids.add(field.value.trim());
    }
  }
  const details = output.context.details;
  if (details !== undefined) {
    for (const [key, value] of Object.entries(details)) {
      const lowerKey = key.toLowerCase();
      if (
        (lowerKey.includes('requestid') || lowerKey.includes('trace')) &&
        typeof value === 'string' &&
        value.trim() !== ''
      ) {
        ids.add(value.trim());
      }
    }
  }
  return [...ids];
}

/**
 * The detected cases of the output, in time order, one per distinct message of an occurrence, each with its own
 * identifiers: the observations of its occurrence.
 * The correlation ids of the output context belong to every case only when no chain observed identifiers (one
 * followed request, as in SEND); otherwise a case without observations has none, and never borrows another's.
 */
function detectedCases(output: RunbookOutput): ReadonlyArray<DetectedCase> {
  if (output.outcome.kind !== 'known-case-matched') return [];
  const fallbackMessage = output.outcome.message;
  // Each detection keeps the identifiers of its own occurrence, never those of another occurrence of the same case.
  const observedByCase = output.outcome.detections.map((detection) => [
    ...new Set((detection.observations ?? []).map((observation) => observation.value)),
  ]);
  // Only an observation typed as a trace id is compared with the analysis by its canonical form.
  const tracesByCase = output.outcome.detections.map((detection) => [
    ...new Set(
      (detection.observations ?? [])
        .filter((observation) => observation.kind === 'traceId')
        .map((observation) => observation.value),
    ),
  ]);
  const contextIds = observedByCase.every((ids) => ids.length === 0) ? correlationIds(output) : [];
  // One candidate per distinct message of an occurrence, in order: each with the identifiers of its occurrence.
  return output.outcome.detections.flatMap((detection, index) => {
    const observed = observedByCase[index] ?? [];
    const messages = detection.resolvedMessages ?? [detection.resolvedMessage ?? fallbackMessage];
    return messages.map((message) => ({
      caseId: detection.caseId,
      description: detection.description,
      message,
      identifiers: observed.length > 0 ? observed : contextIds,
      traceIds: observed.length > 0 ? (tracesByCase[index] ?? []) : [],
    }));
  });
}

/**
 * The detected case that agrees best with the analysis, for the semantic matcher: one case, never the mixture of
 * every case found.
 *
 * @param output - The runbook output
 * @param analysis - The linked analysis
 * @param firedAt - The occurrence timestamp (ISO 8601)
 * @returns The best case, or `undefined` without detections
 */
export function bestDetectedCase(
  output: RunbookOutput,
  analysis: AlarmAnalysisDto,
  firedAt: string,
): DetectedCase | undefined {
  const detected = detectedCases(output);
  if (detected.length === 0) return undefined;
  const evidence = extractAnalysisEvidence(analysis, firedAt, resolveOccurrenceEvidenceWindow(output));
  return bestComparison(detected, evidence).detected;
}

/** The comparison of the case that agrees best with the analysis; on equal scores, the earliest case. */
function bestComparison(
  detected: ReadonlyArray<DetectedCase>,
  evidence: ReturnType<typeof extractAnalysisEvidence>,
): CaseComparison {
  const matches = analysisTraceMatcher(evidence.traceIds);
  let best: CaseComparison | undefined;
  for (const candidate of detected) {
    const traces = new Set(candidate.traceIds);
    const traceIdOverlap = candidate.identifiers.filter((id) => matches(id, traces.has(id)));
    const comparison = compareCase(candidate, evidence, traceIdOverlap);
    if (best === undefined || comparison.score > best.score) best = comparison;
  }
  return best as CaseComparison; // Safe: callers pass at least one detected case
}

/** Signals and score of one detected case against the evidence of the analysis. */
interface CaseComparison {
  readonly detected: DetectedCase;
  readonly signals: AnalysisMatchSignals;
  readonly score: number;
  readonly runbookCategories: ReadonlyArray<string>;
  readonly analysisCategories: ReadonlyArray<string>;
}

function compareCase(
  detected: DetectedCase,
  evidence: ReturnType<typeof extractAnalysisEvidence>,
  traceIdOverlap: ReadonlyArray<string>,
): CaseComparison {
  const caseIdMentioned = evidence.normalizedText.includes(normalize(detected.caseId));
  const descriptionOverlap = detected.description !== '' ? tokenDice(detected.description, evidence.text) : 0;
  const runbookHaystack = normalize(`${detected.message} ${detected.description}`);
  const downstreamOverlap = evidence.downstreamNames.filter((name) => {
    const normalized = normalize(name);
    return normalized !== '' && runbookHaystack.includes(normalized);
  });
  const runbookCategories = matchedKeywordCategories(`${detected.message} ${detected.description} ${detected.caseId}`);
  const analysisCategories = matchedKeywordCategories(evidence.text);
  const errorKeywordOverlap = runbookCategories.filter((category) => analysisCategories.includes(category));
  // Weighted score (tunable); traceId / caseId are near-deterministic.
  const score =
    0.4 * (traceIdOverlap.length > 0 ? 1 : 0) +
    0.25 * (caseIdMentioned ? 1 : 0) +
    0.2 * descriptionOverlap +
    0.1 * (downstreamOverlap.length > 0 ? 1 : 0) +
    0.05 * (errorKeywordOverlap.length > 0 ? 1 : 0);
  return {
    detected,
    signals: { caseIdMentioned, descriptionOverlap, traceIdOverlap, downstreamOverlap, errorKeywordOverlap },
    score,
    runbookCategories,
    analysisCategories,
  };
}

function emptySignals(): AnalysisMatchSignals {
  return {
    caseIdMentioned: false,
    descriptionOverlap: 0,
    traceIdOverlap: [],
    downstreamOverlap: [],
    errorKeywordOverlap: [],
  };
}

/** Synthetic ignore-reason code, preferring the flat field over the nested object. */
function ignoreReasonCode(analysis: AlarmAnalysisDto): string | undefined {
  return nonEmpty(analysis.ignoreReasonCode ?? analysis.ignoreReason?.code);
}

/** Trimmed value, or `undefined` when null/absent/blank. */
function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

/** Human-readable ignore reason: `CODE (label)` when both are known and differ. */
function ignoreReasonText(code: string | undefined, label: string | undefined): string | undefined {
  if (code === undefined) return label;
  if (label === undefined || label === code) return code;
  return `${code} (${label})`;
}

/**
 * Compares the runbook's detected cases (V2) with the linked Watchtower analysis: every case is compared, and the one
 * that agrees best decides. `MATCH_EXACT` is never emitted, since the human tracking is not typed.
 * Lexical and **assisted**: never a hard verdict. Returns a confidence-graded
 * status with explicit reasons and signals (incl. near-deterministic traceId
 * overlap). Only meaningful when the runbook actually matched a case (V1 = HIT).
 *
 * Analyses excluded from the oracle keep two distinct statuses, so an ignored
 * occurrence is never mistaken for a missing one: `IGNORED` (analysis exists but
 * is `IGNORABLE`, carrying its reason code) and `NOT_ANALYZED` (analysis not yet
 * `COMPLETED`).
 *
 * @param output - The structured runbook output (for correlation ids / message)
 * @param check - The V1 classification of the same occurrence
 * @param analysis - The linked analysis, or `undefined` when not linked
 * @param firedAt - The occurrence timestamp (ISO 8601)
 * @param options - Which analyses are usable as oracle
 * @returns The V2 comparison outcome
 */
export function matchAnalysis(
  output: RunbookOutput,
  check: RunbookCheck,
  analysis: AlarmAnalysisDto | undefined,
  firedAt: string,
  options: MatchAnalysisOptions,
): AnalysisMatch {
  if (analysis === undefined) {
    return {
      status: 'NOT_LINKED',
      confidence: 0,
      reasons: ["Nessuna analisi Watchtower collegata all'occorrenza."],
      signals: emptySignals(),
      matcher: 'lexical',
      aiAttempted: false,
    };
  }

  if (analysis.analysisType === 'IGNORABLE' && !options.includeIgnorable) {
    const code = ignoreReasonCode(analysis);
    const label = nonEmpty(analysis.ignoreReason?.label);
    const detail = ignoreReasonText(code, label);
    return {
      status: 'IGNORED',
      confidence: 0,
      reasons: [
        detail === undefined
          ? 'Analisi IGNORABLE senza motivo indicato: non usata come oracolo.'
          : `Analisi IGNORABLE (${detail}): non usata come oracolo.`,
      ],
      signals: emptySignals(),
      matcher: 'lexical',
      aiAttempted: false,
      ...(code !== undefined ? { ignoreReasonCode: code } : {}),
      ...(label !== undefined ? { ignoreReasonLabel: label } : {}),
    };
  }

  if (analysis.status !== 'COMPLETED' && !options.includeIncomplete) {
    return {
      status: 'NOT_ANALYZED',
      confidence: 0,
      reasons: [`Analisi non usata come oracolo: analisi non COMPLETED (${analysis.status}).`],
      signals: emptySignals(),
      matcher: 'lexical',
      aiAttempted: false,
    };
  }

  const window = resolveOccurrenceEvidenceWindow(output);
  const excerpt = pickOccurrenceExcerpt(analysis, firedAt, window);

  const detected = detectedCases(output);
  if (check.status !== 'HIT' || detected.length === 0) {
    return {
      status: 'NO_EVIDENCE',
      confidence: 0,
      reasons: ["Il runbook non ha rilevato un caso noto: nessun caso da confrontare con l'analisi."],
      signals: emptySignals(),
      matcher: 'lexical',
      aiAttempted: false,
      // Carried precisely here: an occurrence the runbook could not classify is
      // the one whose human analysis someone has to read to write the missing
      // known case.
      ...(excerpt !== '' ? { analysisExcerpt: excerpt } : {}),
    };
  }

  const evidence = extractAnalysisEvidence(analysis, firedAt, window);
  // Every detected case is compared with the analysis, with its own identifiers: the one that agrees best decides.
  const best = bestComparison(detected, evidence);
  const { signals, score, runbookCategories, analysisCategories } = best;
  const { traceIdOverlap, caseIdMentioned, descriptionOverlap, downstreamOverlap, errorKeywordOverlap } = signals;

  const reasons: string[] = [];
  if (detected.length > 1)
    reasons.push(`${String(detected.length)} casi rilevati; confronto sul caso "${best.detected.caseId}"`);
  if (traceIdOverlap.length > 0) reasons.push(`traceId in comune: ${traceIdOverlap.join(', ')}`);
  if (caseIdMentioned) reasons.push(`id caso "${best.detected.caseId}" citato nell'analisi`);
  if (descriptionOverlap > 0) reasons.push(`overlap descrizione ${(descriptionOverlap * 100).toFixed(0)}%`);
  if (downstreamOverlap.length > 0) reasons.push(`downstream in comune: ${downstreamOverlap.join(', ')}`);
  if (errorKeywordOverlap.length > 0) reasons.push(`categoria errore in comune: ${errorKeywordOverlap.join(', ')}`);

  let status: V2Status;
  if (traceIdOverlap.length > 0 || caseIdMentioned) {
    // The human tracking is not typed: an identifier or a case id in the text cannot prove an exact match.
    status = 'MATCH_STRONG';
    reasons.push('MATCH_EXACT non emesso: il tracking umano di Watchtower non è tipizzato');
  } else if (score >= 0.65) {
    status = 'MATCH_STRONG';
  } else if (score >= 0.35) {
    status = 'MATCH_WEAK';
  } else if (evidence.normalizedText.length < 8) {
    status = 'NO_EVIDENCE';
    reasons.push('analisi priva di testo significativo');
  } else if (runbookCategories.length > 0 && analysisCategories.length > 0 && errorKeywordOverlap.length === 0) {
    status = 'CONFLICT';
    reasons.push(
      `categoria runbook (${runbookCategories.join('/')}) divergente dall'analisi (${analysisCategories.join('/')})`,
    );
  } else {
    status = 'NO_EVIDENCE';
    reasons.push('segnali insufficienti per confermare la corrispondenza');
  }

  return {
    status,
    confidence: Math.min(1, Number(score.toFixed(2))),
    reasons,
    signals,
    matcher: 'lexical',
    aiAttempted: false,
    ...(excerpt !== '' ? { analysisExcerpt: excerpt } : {}),
  };
}
