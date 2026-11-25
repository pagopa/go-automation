import { interpolatePlaceholders } from '../context/templatePlaceholders.js';
import type { LogActionRenderer } from './LogActionRenderer.js';

/** Stands in for a placeholder the run never resolved. */
const UNAVAILABLE_VALUE = 'non disponibile';

/**
 * Default renderer of the engine: the title, then one `field: value` row per
 * detail, without prefixes or banners.
 */
export const PLAIN_LOG_ACTION_RENDERER: LogActionRenderer = {
  renderText(action, values) {
    const title = interpolatePlaceholders(action.title, values, { missingValue: UNAVAILABLE_VALUE });
    const rows = (action.details ?? []).map(
      ([field, template]) =>
        `${field}: ${interpolatePlaceholders(template, values, { missingValue: UNAVAILABLE_VALUE })}`,
    );
    return [title, ...rows].join('\n');
  },
};
