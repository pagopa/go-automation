import type { GOLogger } from '@pagopa/go-common/logging';

import type { LogAction } from '../types/CaseAction.js';
import type { LogActionValues } from './LogActionValues.js';

/**
 * Port that renders a log action (EVO-RBREORG-OPUS-01 §7.1.3 D). The engine
 * ships a plain default; operational toolkits inject the analysis renderer,
 * whose texts reach Watchtower.
 */
export interface LogActionRenderer {
  /**
   * Text of the action, stored as the resolved message.
   *
   * @param action - The log action
   * @param values - Final `vars` and `params`
   * @returns The rendered text
   */
  renderText(action: LogAction, values: LogActionValues): string;
  /**
   * Rich rendering on the logger. Without it the engine logs `renderText` at the level of the action.
   *
   * @param logger - Logger of the execution
   * @param action - The log action
   * @param values - Current `vars` and `params`
   */
  renderToLogger?(logger: GOLogger, action: LogAction, values: LogActionValues): void;
}
