import type { LogAction, NotifyAction, EscalateAction, CompositeAction, CaseAction } from './CaseAction.js';

/**
 * Creates a log action.
 *
 * @param config - Log action configuration
 * @returns A LogAction instance
 */
export function logAction(config: Omit<LogAction, 'type'>): LogAction {
  return { type: 'log', ...config };
}

/**
 * Creates a notify action.
 *
 * @param config - Notify action configuration
 * @returns A NotifyAction instance
 */
export function notifyAction(config: Omit<NotifyAction, 'type'>): NotifyAction {
  return { type: 'notify', ...config };
}

/**
 * Creates an escalate action.
 *
 * @param config - Escalate action configuration
 * @returns An EscalateAction instance
 */
export function escalateAction(config: Omit<EscalateAction, 'type'>): EscalateAction {
  return { type: 'escalate', ...config };
}

/**
 * Creates a composite action from multiple actions.
 *
 * @param actions - Actions to compose
 * @returns A CompositeAction instance
 */
export function compositeAction(actions: ReadonlyArray<CaseAction>): CompositeAction {
  return { type: 'composite', actions };
}
