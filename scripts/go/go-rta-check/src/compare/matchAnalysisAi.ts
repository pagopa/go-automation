import type { RunbookOutput } from '@go-automation/go-runbook';
import type { GOAISemanticMatcher, GOSemanticMatchResult } from '@go-automation/go-ai';

import type { AlarmAnalysisDto } from '@go-automation/go-watchtower-client';
import type {
  AnalysisMatch,
  AnalysisMatchSignals,
  AnalysisMatchSource,
  RunbookCheck,
  V2Status,
} from '../types/RtaCheckReport.js';
import { extractAnalysisEvidence, pickOccurrenceExcerpt } from './extractAnalysisEvidence.js';
import { matchAnalysis, type MatchAnalysisOptions } from './matchAnalysis.js';

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

function runbookSemanticText(output: RunbookOutput, check: RunbookCheck): string {
  const parts = new Set<string>();
  if (check.primaryCaseDescription !== undefined && check.primaryCaseDescription.trim() !== '') {
    parts.add(check.primaryCaseDescription.trim());
  }
  if (output.outcome.kind === 'known-case-matched') {
    if (output.outcome.message.trim() !== '') parts.add(output.outcome.message.trim());
    const resolvedMessage = output.outcome.matchedCases[0]?.resolvedMessage;
    if (resolvedMessage !== undefined && resolvedMessage.trim() !== '') parts.add(resolvedMessage.trim());
  }
  return [...parts].join('\n');
}

function analysisSemanticText(analysis: AlarmAnalysisDto, firedAt: string): string {
  const excerpt = pickOccurrenceExcerpt(analysis, firedAt).trim();
  if (excerpt !== '') return excerpt;
  return extractAnalysisEvidence(analysis).text.trim();
}

function aiStatus(result: GOSemanticMatchResult, threshold: number): V2Status {
  if (result.score < threshold) {
    const conflictThreshold = Math.max(0, threshold - CONFLICT_SCORE_GAP);
    return result.verdict === 'conflicting' && result.score <= conflictThreshold ? 'CONFLICT' : 'NO_EVIDENCE';
  }
  const strongThreshold = Math.min(100, threshold + 15);
  return result.score >= strongThreshold ? 'MATCH_STRONG' : 'MATCH_WEAK';
}

function withAiNotApplicable(match: AnalysisMatch): AnalysisMatch {
  return {
    status: match.status,
    confidence: match.confidence,
    reasons: match.reasons,
    signals: match.signals,
    aiAttempted: false,
    ...(match.analysisExcerpt !== undefined ? { analysisExcerpt: match.analysisExcerpt } : {}),
  };
}

function hasDeterministicExactMatch(match: AnalysisMatch): boolean {
  return match.status === 'MATCH_EXACT' && (match.signals.traceIdOverlap.length > 0 || match.signals.caseIdMentioned);
}

function withDeterministicExactMatch(match: AnalysisMatch): AnalysisMatch {
  const signals = [];
  if (match.signals.traceIdOverlap.length > 0) signals.push('traceId');
  if (match.signals.caseIdMentioned) signals.push('caseId');
  return {
    ...match,
    matcher: MATCH_SOURCE.deterministic,
    aiAttempted: false,
    reasons: [...match.reasons, `GO-AI non invocato: match deterministico ${signals.join('/')} già esatto.`],
  };
}

function deterministicAuditReason(result: GOSemanticMatchResult, threshold: number): string {
  if (result.score < threshold || result.verdict === 'conflicting') {
    return 'MATCH_EXACT mantenuto per evidenza deterministica; GO-AI segnala una possibile divergenza nel testo operatore.';
  }
  return 'MATCH_EXACT mantenuto per evidenza deterministica; GO-AI conferma il testo operatore come audit semantico.';
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
  if (analysis === undefined || lexical.status === 'NOT_LINKED' || lexical.status === 'NOT_ANALYZED') {
    return withAiNotApplicable(lexical);
  }
  if (check.status !== 'HIT' || check.primaryCaseId === undefined) {
    return withAiNotApplicable(lexical);
  }
  const deterministicExact = hasDeterministicExactMatch(lexical);

  const runbookText = runbookSemanticText(output, check);
  const analysisText = analysisSemanticText(analysis, firedAt);
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
      status: deterministicExact ? 'MATCH_EXACT' : aiStatus(result, options.semanticThreshold),
      confidence: deterministicExact ? lexical.confidence : confidence,
      reasons,
      signals: withSemanticSignals(lexical, result),
      matcher: deterministicExact ? MATCH_SOURCE.deterministicAi : MATCH_SOURCE.ai,
      aiAttempted: true,
      ...(result.explanation.trim() !== '' ? { semanticExplanation: result.explanation.trim() } : {}),
      ...(lexical.analysisExcerpt !== undefined ? { analysisExcerpt: lexical.analysisExcerpt } : {}),
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
          `GO-AI semantic-match non disponibile (${message}); MATCH_EXACT mantenuto per evidenza deterministica.`,
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
      ...(lexical.analysisExcerpt !== undefined ? { analysisExcerpt: lexical.analysisExcerpt } : {}),
    };
  }
}
