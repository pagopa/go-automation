import type { RunbookOutput } from '@go-automation/go-runbook';

import type { AlarmAnalysisDto } from '../types/WatchtowerDtos.js';
import type { AnalysisMatch, AnalysisMatchSignals, RunbookCheck, V2Status } from '../types/RtaCheckReport.js';
import { extractAnalysisEvidence, pickOccurrenceExcerpt } from './extractAnalysisEvidence.js';
import { matchedKeywordCategories } from './synonyms.js';
import { normalize, tokenDice } from './text.js';

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

/** Resolved (interpolated) message of the primary matched case. */
function runbookCaseMessage(output: RunbookOutput): string {
  if (output.outcome.kind === 'known-case-matched') {
    return output.outcome.matchedCases[0]?.resolvedMessage ?? output.outcome.message;
  }
  return '';
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

/**
 * Compares the runbook's matched case (V2) with the linked Watchtower analysis.
 * Lexical and **assisted**: never a hard verdict. Returns a confidence-graded
 * status with explicit reasons and signals (incl. near-deterministic traceId
 * overlap). Only meaningful when the runbook actually matched a case (V1 = HIT).
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
    };
  }

  const ignorable = analysis.analysisType === 'IGNORABLE';
  const notCompleted = analysis.status !== 'COMPLETED';
  if ((ignorable && !options.includeIgnorable) || (notCompleted && !options.includeIncomplete)) {
    const why = ignorable ? 'analisi IGNORABLE' : `analisi non COMPLETED (${analysis.status})`;
    return {
      status: 'NOT_ANALYZED',
      confidence: 0,
      reasons: [`Analisi non usata come oracolo: ${why}.`],
      signals: emptySignals(),
    };
  }

  if (check.status !== 'HIT' || check.primaryCaseId === undefined) {
    return {
      status: 'NO_EVIDENCE',
      confidence: 0,
      reasons: ["Il runbook non ha rilevato un caso noto: nessun caso da confrontare con l'analisi."],
      signals: emptySignals(),
    };
  }

  const evidence = extractAnalysisEvidence(analysis);
  const excerpt = pickOccurrenceExcerpt(analysis, firedAt);
  const caseMessage = runbookCaseMessage(output);
  const caseDescription = check.primaryCaseDescription ?? '';

  const caseIdMentioned = evidence.normalizedText.includes(normalize(check.primaryCaseId));
  const descriptionOverlap = caseDescription !== '' ? tokenDice(caseDescription, evidence.text) : 0;

  const analysisTraceLower = new Set(evidence.traceIds.map((id) => id.toLowerCase()));
  const traceIdOverlap = correlationIds(output).filter((id) => analysisTraceLower.has(id.toLowerCase()));

  const runbookHaystack = normalize(`${caseMessage} ${caseDescription}`);
  const downstreamOverlap = evidence.downstreamNames.filter((name) => {
    const normalized = normalize(name);
    return normalized !== '' && runbookHaystack.includes(normalized);
  });

  const runbookCategories = matchedKeywordCategories(`${caseMessage} ${caseDescription} ${check.primaryCaseId}`);
  const analysisCategories = matchedKeywordCategories(evidence.text);
  const errorKeywordOverlap = runbookCategories.filter((category) => analysisCategories.includes(category));

  const signals: AnalysisMatchSignals = {
    caseIdMentioned,
    descriptionOverlap,
    traceIdOverlap,
    downstreamOverlap,
    errorKeywordOverlap,
  };

  // Weighted score (tunable); traceId / caseId are near-deterministic.
  const score =
    0.4 * (traceIdOverlap.length > 0 ? 1 : 0) +
    0.25 * (caseIdMentioned ? 1 : 0) +
    0.2 * descriptionOverlap +
    0.1 * (downstreamOverlap.length > 0 ? 1 : 0) +
    0.05 * (errorKeywordOverlap.length > 0 ? 1 : 0);

  const reasons: string[] = [];
  if (traceIdOverlap.length > 0) reasons.push(`traceId in comune: ${traceIdOverlap.join(', ')}`);
  if (caseIdMentioned) reasons.push(`id caso "${check.primaryCaseId}" citato nell'analisi`);
  if (descriptionOverlap > 0) reasons.push(`overlap descrizione ${(descriptionOverlap * 100).toFixed(0)}%`);
  if (downstreamOverlap.length > 0) reasons.push(`downstream in comune: ${downstreamOverlap.join(', ')}`);
  if (errorKeywordOverlap.length > 0) reasons.push(`categoria errore in comune: ${errorKeywordOverlap.join(', ')}`);

  let status: V2Status;
  if (traceIdOverlap.length > 0 || caseIdMentioned) {
    status = 'MATCH_EXACT';
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
    ...(excerpt !== '' ? { analysisExcerpt: excerpt } : {}),
  };
}
