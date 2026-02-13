import type { Step } from '../types/Step.js';

/**
 * Action to execute when a known case is recognized.
 */
export type CaseAction = LogAction | NotifyAction | UpdateAction | EscalateAction | CompositeAction;

/**
 * Log the result (for informational cases).
 */
export interface LogAction {
  readonly type: 'log';
  readonly level: 'info' | 'warn' | 'error';
  /** Message template supporting {{vars.xxx}} interpolation */
  readonly message: string;
}

/**
 * Send a notification (Slack, email, etc.).
 */
export interface NotifyAction {
  readonly type: 'notify';
  readonly channel: string;
  /** Message template supporting {{vars.xxx}} interpolation */
  readonly template: string;
}

/**
 * Execute a mutation step update (DynamoDB, API, etc.).
 */
export interface UpdateAction {
  readonly type: 'update';
  /** Mutation step to execute */
  readonly step: Step;
}

/**
 * Escalate to a team/person.
 */
export interface EscalateAction {
  readonly type: 'escalate';
  readonly team: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  /** Message template supporting {{vars.xxx}} interpolation */
  readonly message: string;
}

/**
 * Composition of multiple actions.
 */
export interface CompositeAction {
  readonly type: 'composite';
  readonly actions: ReadonlyArray<CaseAction>;
}
