import type { GOLogger } from '@pagopa/go-common/logging';

import type { LogActionRenderer } from '../../../../engine/actions/LogActionRenderer.js';
import type { LogActionValues } from '../../../../engine/actions/LogActionValues.js';
import { interpolatePlaceholders } from '../../../../engine/context/templatePlaceholders.js';
import type { LogAction } from '../../../../engine/types/CaseAction.js';
import { renderLogActionText, resolveLogActionRows, UNAVAILABLE_VALUE } from './renderLogAction.js';

/** Console block of a known or unknown case. */
interface StructuredLogBanner {
  readonly kind: 'success' | 'warning';
  readonly text: string;
  readonly titleField: string;
  readonly dropUnavailable: boolean;
}

/**
 * Banners of the analysis outcomes; any other `renderAs` is logged as plain text.
 * A Map, not an object: `renderAs` is an opaque string, and a lookup must not
 * reach `Object.prototype` (e.g. `'toString'`).
 */
const BANNERS: ReadonlyMap<string, StructuredLogBanner> = new Map([
  ['known-case', { kind: 'success', text: 'Caso noto rilevato', titleField: 'Caso', dropUnavailable: false }],
  ['unknown-case', { kind: 'warning', text: 'Caso non riconosciuto', titleField: 'Esito', dropUnavailable: true }],
]);

/**
 * Renderer of the analysis outcomes (EVO-RBREORG-OPUS-01 §7.1.3 D): the text
 * carries the `[CASO NOTO]` / `[CASO NON RICONOSCIUTO]` prefixes that reach
 * Watchtower, and the console shows a banner and a table for the two outcomes.
 * Injected by the operational engine.
 */
export const ANALYSIS_LOG_ACTION_RENDERER: LogActionRenderer = {
  renderText: renderLogActionText,
  renderToLogger(logger: GOLogger, action: LogAction, values: LogActionValues): void {
    const banner = action.renderAs === undefined ? undefined : BANNERS.get(action.renderAs);
    if (banner === undefined) {
      logPlain(logger, action, renderLogActionText(action, values));
      return;
    }

    const rows = resolveLogActionRows(action, values);
    logger.newline();
    if (banner.kind === 'success') logger.success(banner.text);
    else logger.warning(banner.text);

    logger.table({
      columns: [
        { header: 'Campo', key: 'field', width: 24 },
        { header: 'Valore', key: 'value' },
      ],
      data: [
        {
          field: banner.titleField,
          // Same fallback as the rows and as `renderLogActionText`: without it
          // the title leaks a raw `{{vars.x}}` into the very table whose rows
          // read `non disponibile`, and disagrees with the stored message.
          value: interpolatePlaceholders(action.title, values, { missingValue: UNAVAILABLE_VALUE }),
        },
        // A row the run never produced tells the reader nothing.
        ...rows
          .filter((row) => !banner.dropUnavailable || row.value !== UNAVAILABLE_VALUE)
          .map((row) => ({ field: row.field, value: row.value })),
      ],
      maxColumnWidth: 120,
      style: { colors: false },
    });
  },
};

function logPlain(logger: GOLogger, action: LogAction, message: string): void {
  switch (action.level) {
    case 'info':
      logger.info(message);
      break;
    case 'warn':
      logger.warning(message);
      break;
    case 'error':
      logger.error(message);
      break;
    default: {
      const exhaustive: never = action.level;
      throw new Error(`Unknown log level: ${String(exhaustive)}`);
    }
  }
}
