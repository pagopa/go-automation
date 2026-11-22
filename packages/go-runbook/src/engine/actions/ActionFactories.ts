import type { LogAction } from '../types/LogAction.js';

/**
 * Creates a log action.
 *
 * @param config - Log action configuration
 * @returns A LogAction instance
 */
export function logAction(config: Omit<LogAction, 'type'>): LogAction {
  return { type: 'log', ...config };
}
