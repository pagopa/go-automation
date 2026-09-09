import type { Step } from '../types/Step.js';

/**
 * Action to execute when a known case is recognized.
 */
export type CaseAction = LogAction | NotifyAction | UpdateAction | EscalateAction | CompositeAction;
export type CaseActionType = 'log' | 'notify' | 'update' | 'escalate' | 'composite';

/**
 * One `Etichetta: valore` row of a log action.
 *
 * The value is a template: `{{vars.x}}` and `{{params.x}}` are resolved
 * per row against the final context, so a value carrying `:` or a newline
 * — a stack trace, say — stays inside its own row.
 */
export type LogActionRow = readonly [label: string, template: string];

/**
 * Log the result (for informational cases).
 *
 * The action carries the structure it wants rendered rather than a
 * pre-serialised block of text: the console renders a table from
 * {@link title} and {@link details} directly, and the string published in
 * the runbook output is produced from the same two fields.
 */
export interface LogAction {
  readonly type: 'log';
  readonly level: 'info' | 'warn' | 'error';
  /** What happened, without any prefix: the renderer adds the marker. */
  readonly title: string;
  /** Evidence rows rendered under the title. */
  readonly details?: ReadonlyArray<LogActionRow>;
  /**
   * How the console renders the action. `known-case` and `unknown-case`
   * produce the banner + table block; `plain` (the default) logs the text.
   */
  readonly renderAs?: 'plain' | 'known-case' | 'unknown-case';
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
