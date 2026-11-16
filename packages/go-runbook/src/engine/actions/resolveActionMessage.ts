import { interpolatePlaceholders } from '../context/templatePlaceholders.js';
import type { CaseAction } from '../types/CaseAction.js';
import type { LogActionRenderer } from './LogActionRenderer.js';
import type { LogActionValues } from './LogActionValues.js';

/**
 * Message an action resolves to: the rendered text of a log action, the
 * interpolated template of a notification or an escalation, nothing for
 * updates and composites. Shared by the action executor and the output
 * builder, so they cannot drift apart (EVO-RBREORG-OPUS-01 P09).
 *
 * @param action - The action
 * @param values - `vars` and `params` to interpolate
 * @param renderer - Renderer of log actions
 * @returns The resolved message, or `undefined`
 */
export function resolveActionMessage(
  action: CaseAction,
  values: LogActionValues,
  renderer: LogActionRenderer,
): string | undefined {
  switch (action.type) {
    case 'log':
      return renderer.renderText(action, values);
    case 'notify':
      return interpolatePlaceholders(action.template, values);
    case 'escalate':
      return interpolatePlaceholders(action.message, values);
    case 'update':
    case 'composite':
      return undefined;
    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown action type: ${(exhaustive as CaseAction).type}`);
    }
  }
}
