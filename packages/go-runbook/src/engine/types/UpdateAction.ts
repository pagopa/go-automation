import type { Step } from './Step.js';

/**
 * Execute a mutation step update (DynamoDB, API, etc.).
 */
export interface UpdateAction {
  readonly type: 'update';
  /** Mutation step to execute */
  readonly step: Step;
}
