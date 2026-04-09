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
