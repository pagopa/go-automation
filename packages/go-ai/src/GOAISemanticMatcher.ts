/**
 * Semantic-match helper built on top of the GO-AI invoker contract.
 */

import { parseGOAIJsonOutput } from './GOAIOutputParser.js';
import {
  GOAIHat,
  type GOAIInvoker,
  type GOSemanticMatchInput,
  type GOSemanticMatchResult,
  type GOSemanticMatchVerdict,
} from './types/index.js';

export interface GOAISemanticMatcherOptions {
  readonly client: GOAIInvoker;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly threshold?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeScore(value: unknown): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new Error(`Invalid semantic-match score: ${String(value)}`);
  }
  return numeric;
}

function normalizeThreshold(value: unknown): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 70;
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 100) {
    throw new Error(`Invalid semantic-match threshold: ${String(value)}`);
  }
  return numeric;
}

function normalizeVerdict(value: unknown, score: number, threshold: number): GOSemanticMatchVerdict {
  if (value === 'equivalent' || value === 'conflicting') return value;
  return score >= threshold ? 'equivalent' : 'conflicting';
}

/**
 * Parses and validates a `semantic-match` model response.
 *
 * @param raw - Raw GO-AI response output
 * @returns The normalized semantic-match result
 */
export function parseGOSemanticMatchResult(raw: string, threshold = 70): GOSemanticMatchResult {
  const parsed = parseGOAIJsonOutput(raw);
  if (!isRecord(parsed)) {
    throw new Error('Invalid semantic-match response: expected a JSON object');
  }

  const normalizedThreshold = normalizeThreshold(threshold);
  const score = normalizeScore(parsed['score']);
  const explanation = typeof parsed['explanation'] === 'string' ? parsed['explanation'] : '';
  const verdict = normalizeVerdict(parsed['verdict'], score, normalizedThreshold);
  return { score, explanation, verdict };
}

/**
 * Invokes the `semantic-match` hat and returns its structured result.
 */
export class GOAISemanticMatcher {
  private readonly client: GOAIInvoker;
  private readonly maxTokens: number | undefined;
  private readonly temperature: number | undefined;
  private readonly threshold: number;

  constructor(options: GOAISemanticMatcherOptions) {
    this.client = options.client;
    this.maxTokens = options.maxTokens;
    this.temperature = options.temperature;
    this.threshold = normalizeThreshold(options.threshold);
  }

  /**
   * Compares two expressions semantically through GO-AI.
   *
   * @param input - Pair of expressions to compare
   * @returns The normalized semantic-match result
   */
  async match(input: GOSemanticMatchInput): Promise<GOSemanticMatchResult> {
    const threshold = normalizeThreshold(input.threshold ?? this.threshold);
    const response = await this.client.invoke({
      hat: GOAIHat.SemanticMatch,
      input: JSON.stringify({ ...input, threshold }),
      ...(this.maxTokens !== undefined ? { maxTokens: this.maxTokens } : {}),
      ...(this.temperature !== undefined ? { temperature: this.temperature } : {}),
    });
    return parseGOSemanticMatchResult(response.output, threshold);
  }
}
