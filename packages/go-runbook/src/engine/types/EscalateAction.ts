import type { EscalationSeverity } from './EscalationSeverity.js';

/**
 * Escalate to a team/person.
 */
export interface EscalateAction {
  readonly type: 'escalate';
  readonly team: string;
  readonly severity: EscalationSeverity;
  /** Message template supporting {{vars.xxx}} interpolation */
  readonly message: string;
}
