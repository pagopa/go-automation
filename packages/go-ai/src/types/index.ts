/**
 * GO-AI types
 */

export enum GOAIHat {
  Normal = 'normal',
  Gherkin = 'gherkin',
  SRSAnalysis = 'srs-analysis',
  CodeReview = 'code-review',
  RunbookAssist = 'runbook-assist',
  AlarmDiagnosis = 'alarm-diagnosis',
  SemanticMatch = 'semantic-match',
}

export interface GOAIRequest {
  readonly hat: GOAIHat;
  readonly input: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface GOAIResponse {
  readonly output: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly hat: GOAIHat;
}

/** Minimal invoker contract for GO-AI clients. */
export interface GOAIInvoker {
  invoke(req: GOAIRequest): Promise<GOAIResponse>;
}

/** Input contract for the `semantic-match` hat. */
export interface GOSemanticMatchInput {
  readonly a: string;
  readonly b: string;
}

/** Verdict returned by the `semantic-match` hat. */
export type GOSemanticMatchVerdict = 'equivalent' | 'conflicting';

/** Structured output contract for the `semantic-match` hat. */
export interface GOSemanticMatchResult {
  readonly score: number;
  readonly explanation: string;
  readonly verdict: GOSemanticMatchVerdict;
}
