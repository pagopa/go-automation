import type { RunbookOutput } from '@pagopa/go-runbook/output';
import type { GOAISemanticMatcher, GOSemanticMatchResult } from '@go-automation/go-ai';

import type { AlarmAnalysisDto } from '@go-automation/go-watchtower-client';
import type {
  AnalysisMatch,
  AnalysisMatchSignals,
  AnalysisMatchSource,
  RunbookCheck,
  V2Status,
} from '../types/RtaCheckReport.js';
import {
  extractAnalysisEvidence,
  pickOccurrenceExcerpt,
  pickTrackingExcerpt,
} from '../evidence/extractAnalysisEvidence.js';
import type { DetectedCase } from './DetectedCase.js';
import { bestDetectedCase, matchAnalysis, type MatchAnalysisOptions } from './matchAnalysis.js';
import { resolveOccurrenceEvidenceWindow } from '../evidence/resolveOccurrenceEvidenceWindow.js';

export interface MatchAnalysisAiOptions extends MatchAnalysisOptions {
  readonly semanticMatcher: Pick<GOAISemanticMatcher, 'match'>;
  readonly semanticThreshold: number;
  readonly fallbackToLexical: boolean;
}

const MATCH_SOURCE = {
  ai: 'ai',
  deterministic: 'deterministic',
  deterministicAi: 'deterministic+ai',
  lexical: 'lexical',
} as const satisfies Record<string, AnalysisMatchSource>;

const CONFLICT_SCORE_GAP = 40;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The description and message of the detected case, without repetitions. */
function caseSemanticText(detected: DetectedCase | undefined): string {
  if (detected === undefined) return '';
  return [...new Set([detected.description, detected.message].map((text) => text.trim()))]
    .filter((text) => text !== '')
    .join('\n');
}

/**
 * The human text compared with the case: the tracking entry about the case's own identifiers when there is one,
 * otherwise the excerpt of the occurrence.
 */
function analysisSemanticText(
  output: RunbookOutput,
  analysis: AlarmAnalysisDto,
  firedAt: string,
  detected: DetectedCase | undefined,
): string {
  const window = resolveOccurrenceEvidenceWindow(output);
  const tracked = pickTrackingExcerpt(
    analysis,
    detected?.identifiers ?? [],
    firedAt,
    window,
    detected?.traceIds ?? [],
  )?.trim();
  if (tracked !== undefined && tracked !== '') return tracked;
  const excerpt = pickOccurrenceExcerpt(analysis, firedAt, window).trim();
  if (excerpt !== '') return excerpt;
  return extractAnalysisEvidence(analysis, firedAt, window).text.trim();
}

function aiStatus(result: GOSemanticMatchResult, threshold: number): V2Status {
  if (result.score < threshold) {
    const conflictThreshold = Math.max(0, threshold - CONFLICT_SCORE_GAP);
    return result.verdict === 'conflicting' && result.score <= conflictThreshold ? 'CONFLICT' : 'NO_EVIDENCE';
  }
  const strongThreshold = Math.min(100, threshold + 15);
  return result.score >= strongThreshold ? 'MATCH_STRONG' : 'MATCH_WEAK';
}

/**
 * Records that the AI matcher did not run on this comparison, leaving the
 * lexical verdict otherwise untouched.
 *
 * Spreads on purpose: listing the fields to keep meant every optional one the
 * lexical matcher sets outside that list was silently dropped — `matcher` and,
 * on an `IGNORED` row, `ignoreReasonCode` / `ignoreReasonLabel`, which the
 * console needs to say *why* an analysis was ignored. Callers always pass a
 * lexical result, so there are no AI fields to strip.
 *
 * @param match - The lexical comparison outcome
 * @returns The same outcome, marked as not attempted by the AI matcher
 */
function withAiNotApplicable(match: AnalysisMatch): AnalysisMatch {
  return { ...match, aiAttempted: false };
}

/** A traceId or case id in common: the strongest agreement an untyped human tracking allows. */
function hasDeterministicExactMatch(match: AnalysisMatch): boolean {
  return match.status === 'MATCH_STRONG' && (match.signals.traceIdOverlap.length > 0 || match.signals.caseIdMentioned);
}

function withDeterministicExactMatch(match: AnalysisMatch): AnalysisMatch {
  const signals = [];
  if (match.signals.traceIdOverlap.length > 0) signals.push('traceId');
  if (match.signals.caseIdMentioned) signals.push('caseId');
  return {
    ...match,
    matcher: MATCH_SOURCE.deterministic,
    aiAttempted: false,
    reasons: [...match.reasons, `GO-AI non invocato: match deterministico ${signals.join('/')} già forte.`],
  };
}

function deterministicAuditReason(result: GOSemanticMatchResult, threshold: number): string {
  if (result.score < threshold || result.verdict === 'conflicting') {
    return 'MATCH_STRONG mantenuto per evidenza deterministica; GO-AI segnala una possibile divergenza nel testo operatore.';
  }
  return 'MATCH_STRONG mantenuto per evidenza deterministica; GO-AI conferma il testo operatore come audit semantico.';
}

function withSemanticSignals(match: AnalysisMatch, result: GOSemanticMatchResult): AnalysisMatchSignals {
  return {
    ...match.signals,
    semanticScore: result.score,
    semanticVerdict: result.verdict,
  };
}

/**
 * Compares runbook output with Watchtower analysis using GO-AI semantic-match
 * for the text similarity component, while preserving deterministic guards.
 *
 * @param output - Structured runbook output
 * @param check - V1 runbook classification
 * @param analysis - Linked Watchtower analysis
 * @param firedAt - Occurrence timestamp
 * @param options - Filtering and GO-AI invocation options
 * @returns The V2 comparison outcome
 */
export async function matchAnalysisAi(
  output: RunbookOutput,
  check: RunbookCheck,
  analysis: AlarmAnalysisDto | undefined,
  firedAt: string,
  options: MatchAnalysisAiOptions,
): Promise<AnalysisMatch> {
  const lexical = matchAnalysis(output, check, analysis, firedAt, options);
  if (
    analysis === undefined ||
    lexical.status === 'NOT_LINKED' ||
    lexical.status === 'IGNORED' ||
    lexical.status === 'NOT_ANALYZED'
  ) {
    return withAiNotApplicable(lexical);
  }
  if (check.status !== 'HIT' || check.matchedCaseIds.length === 0) {
    return withAiNotApplicable(lexical);
  }
  const deterministicExact = hasDeterministicExactMatch(lexical);

  const detected = bestDetectedCase(output, analysis, firedAt);
  const runbookText = caseSemanticText(detected);
  const analysisText = analysisSemanticText(output, analysis, firedAt, detected);
  if (runbookText === '' || analysisText === '') {
    const base = deterministicExact ? withDeterministicExactMatch(lexical) : withAiNotApplicable(lexical);
    return {
      ...base,
      reasons: [...base.reasons, 'GO-AI non invocato: testo insufficiente per il confronto semantico.'],
    };
  }

  try {
    const result = await options.semanticMatcher.match({ a: runbookText, b: analysisText });
    const confidence = Number((result.score / 100).toFixed(2));
    const reasons = [
      `GO-AI semantic-match: score ${result.score}/100, verdict ${result.verdict}`,
      ...(result.explanation.trim() !== '' ? [result.explanation.trim()] : []),
      ...(deterministicExact ? [deterministicAuditReason(result, options.semanticThreshold)] : []),
      ...lexical.reasons,
    ];
    return {
      status: deterministicExact ? 'MATCH_STRONG' : aiStatus(result, options.semanticThreshold),
      confidence: deterministicExact ? lexical.confidence : confidence,
      reasons,
      signals: withSemanticSignals(lexical, result),
      matcher: deterministicExact ? MATCH_SOURCE.deterministicAi : MATCH_SOURCE.ai,
      aiAttempted: true,
      ...(result.explanation.trim() !== '' ? { semanticExplanation: result.explanation.trim() } : {}),
      // The excerpt shown is the human text the AI compared.
      analysisExcerpt: analysisText,
    };
  } catch (error) {
    const message = errorMessage(error);
    if (deterministicExact) {
      return {
        ...lexical,
        matcher: MATCH_SOURCE.deterministic,
        aiAttempted: true,
        aiError: message,
        reasons: [
          ...lexical.reasons,
          `GO-AI semantic-match non disponibile (${message}); MATCH_STRONG mantenuto per evidenza deterministica.`,
        ],
      };
    }

    if (options.fallbackToLexical) {
      return {
        ...lexical,
        matcher: MATCH_SOURCE.lexical,
        aiAttempted: true,
        aiFallback: true,
        aiError: message,
        reasons: [...lexical.reasons, `GO-AI semantic-match non disponibile (${message}); fallback lessicale.`],
      };
    }

    return {
      status: 'NO_EVIDENCE',
      confidence: 0,
      reasons: [`GO-AI semantic-match non disponibile: ${message}.`],
      signals: lexical.signals,
      matcher: MATCH_SOURCE.ai,
      aiAttempted: true,
      aiError: message,
      analysisExcerpt: analysisText,
    };
  }
}
