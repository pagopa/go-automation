import type { EscalateAction } from './EscalateAction.js';
import type { LogAction } from './LogAction.js';
import type { NotifyAction } from './NotifyAction.js';
import type { UpdateAction } from './UpdateAction.js';

/**
 * Action to execute when a known case is recognized.
 */
export type CaseAction = LogAction | NotifyAction | UpdateAction | EscalateAction | CompositeAction;

/**
 * Composition of multiple actions.
 */
export interface CompositeAction {
  readonly type: 'composite';
  readonly actions: ReadonlyArray<CaseAction>;
}
