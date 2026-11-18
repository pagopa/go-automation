import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GOLogger } from '@pagopa/go-common/logging';

import { ActionExecutor } from '../../../../../engine/actions/ActionExecutor.js';
import { ANALYSIS_LOG_ACTION_RENDERER } from '../ANALYSIS_LOG_ACTION_RENDERER.js';
import { renderLogActionText } from '../renderLogAction.js';
import { unknownCaseFallback } from '../unknownCaseFallback.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';

/** Captures the rows the executor renders, which is what the operator reads. */
async function renderedRows(
  action: ReturnType<typeof unknownCaseFallback>,
  vars: Readonly<Record<string, string>>,
): Promise<ReadonlyArray<{ field: string; value: string }>> {
  const logger = new GOLogger();
  const rows: { field: string; value: string }[] = [];
  (logger as unknown as { table: unknown }).table = (arg: {
    data: ReadonlyArray<{ field: string; value: string }>;
  }): void => {
    rows.push(...arg.data);
  };
  await new ActionExecutor(logger, ANALYSIS_LOG_ACTION_RENDERER).execute(action, createTestContext({ vars }));
  return rows;
}

describe('unknownCaseFallback', () => {
  it('declares the rendering mode the marker follows from, never the marker itself', () => {
    const action = unknownCaseFallback('Titolo.', [['Campo', 'valore']]);
    assert.strictEqual(action.type, 'log');
    assert.strictEqual(action.renderAs, 'unknown-case');
    assert.strictEqual(action.level, 'warn');
    // The title carries no marker: the rendering mode is what puts it there.
    assert.strictEqual(action.title, 'Titolo.');

    const rendered = renderLogActionText(action, { vars: new Map(), params: new Map() });
    assert.ok(rendered.startsWith('[CASO NON RICONOSCIUTO] Titolo.'));
  });

  it('renders the title once, as a single Esito row', async () => {
    // Regression: a message whose first line held only the prefix used to
    // produce two Esito rows, the first one a placeholder invented by the parser.
    const rows = await renderedRows(unknownCaseFallback('Causa non determinata.', []), {});
    assert.deepStrictEqual(rows, [{ field: 'Esito', value: 'Causa non determinata.' }]);
  });

  it('resolves placeholders against the context', async () => {
    const rows = await renderedRows(unknownCaseFallback('Titolo.', [['Ambiente', '{{vars.env}}']]), { env: 'prod' });
    assert.deepStrictEqual(rows[1], { field: 'Ambiente', value: 'prod' });
  });

  it('drops rows whose value the run never produced, instead of leaking the placeholder', async () => {
    // Regression: a fallback spelling the prefix differently got no
    // `missingValue`, so raw {{vars.x}} reached the operator and the trace.
    const rows = await renderedRows(unknownCaseFallback('Titolo.', [['Ambiente', '{{vars.env}}']]), {});
    assert.strictEqual(rows.length, 1);
    assert.ok(!JSON.stringify(rows).includes('{{vars.'));
  });
});
