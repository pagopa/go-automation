import { GOBedrockClient, GOAISemanticMatcher } from '@go-automation/go-ai';

import type { AnalysisMatcherFn } from '../compare/AnalysisMatcher.js';
import { matchAnalysis } from '../compare/matchAnalysis.js';
import { matchAnalysisAi } from '../compare/matchAnalysisAi.js';
import type { AnalysisMatcherKind } from '../types/RtaCheckReport.js';
import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';

export interface ResolvedAnalysisMatcher {
  readonly kind: AnalysisMatcherKind;
  readonly match: AnalysisMatcherFn;
  readonly semanticThreshold?: number;
}

function normalizeMatcher(value: string | undefined): AnalysisMatcherKind {
  const normalized = (value ?? 'ai').trim().toLowerCase();
  if (normalized === 'lexical' || normalized === 'ai') return normalized;
  throw new Error(`analysis.matcher non valido: ${value}. Valori ammessi: lexical, ai.`);
}

function normalizeThreshold(value: number | undefined): number {
  const threshold = value ?? 70;
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
    throw new Error(`go.ai.semanticThreshold non valido: ${String(value)}. Deve essere un intero 0..100.`);
  }
  return threshold;
}

function createSemanticMatcher(config: GoRtaCheckConfig): GOAISemanticMatcher {
  const client = new GOBedrockClient({
    ...(config.awsRegion !== undefined ? { region: config.awsRegion } : {}),
    ...(config.awsProfile !== undefined ? { profile: config.awsProfile } : {}),
  });
  return new GOAISemanticMatcher({
    client,
    maxTokens: 500,
    temperature: 0,
  });
}

/**
 * Builds the configured V2 matcher.
 *
 * @param config - Validated script configuration
 * @returns The matcher implementation and report metadata
 */
export function resolveAnalysisMatcher(config: GoRtaCheckConfig): ResolvedAnalysisMatcher {
  const kind = normalizeMatcher(config.analysisMatcher);
  if (kind === 'lexical') {
    return {
      kind,
      match: async (output, check, analysis, firedAt, options) => {
        await Promise.resolve();
        return matchAnalysis(output, check, analysis, firedAt, options);
      },
    };
  }

  const semanticThreshold = normalizeThreshold(config.goAiSemanticThreshold);
  const semanticMatcher = createSemanticMatcher(config);
  const fallbackToLexical = config.goAiFallbackToLexical !== false;

  return {
    kind,
    semanticThreshold,
    match: async (output, check, analysis, firedAt, options) => {
      const result = await matchAnalysisAi(output, check, analysis, firedAt, {
        ...options,
        semanticMatcher,
        semanticThreshold,
        fallbackToLexical,
      });
      return result;
    },
  };
}

/**
 * Renders the matcher choice for console output.
 *
 * @param resolved - Resolved matcher configuration
 * @returns Human-readable matcher label
 */
export function formatAnalysisMatcherLabel(resolved: ResolvedAnalysisMatcher): string {
  if (resolved.kind === 'lexical') return 'lexical';
  return `ai (Bedrock diretto, soglia ${resolved.semanticThreshold ?? 70})`;
}
