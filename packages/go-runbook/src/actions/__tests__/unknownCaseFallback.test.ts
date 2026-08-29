import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GOLogger } from '@go-automation/go-common/core';

import { ActionExecutor } from '../ActionExecutor.js';
import { renderLogActionText, UNKNOWN_CASE_PREFIX } from '../renderLogAction.js';
import { unknownCaseFallback } from '../unknownCaseFallback.js';
import type { RunbookContext } from '../../types/RunbookContext.js';

function contextWith(vars: ReadonlyMap<string, string>): RunbookContext {
  return {
    executionId: 'x',
    startedAt: new Date(),
    stepResults: new Map(),
    vars,
    params: new Map(),
    logs: [],
    services: {} as never,
    recoveredErrors: [],
  };
}

/** Captures the rows the executor renders, which is what the operator reads. */
async function renderedRows(
  action: ReturnType<typeof unknownCaseFallback>,
  vars: ReadonlyMap<string, string>,
): Promise<ReadonlyArray<{ field: string; value: string }>> {
  const logger = new GOLogger();
  const rows: { field: string; value: string }[] = [];
  (logger as unknown as { table: unknown }).table = (arg: {
    data: ReadonlyArray<{ field: string; value: string }>;
  }): void => {
    rows.push(...arg.data);
  };
  await new ActionExecutor(logger).execute(action, contextWith(vars));
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
    assert.ok(rendered.startsWith(`${UNKNOWN_CASE_PREFIX} Titolo.`));
  });

  it('renders the title once, as a single Esito row', async () => {
    // Regression: a message whose first line held only the prefix used to
    // produce two Esito rows, the first one a placeholder invented by the parser.
    const rows = await renderedRows(unknownCaseFallback('Causa non determinata.', []), new Map());
    assert.deepStrictEqual(rows, [{ field: 'Esito', value: 'Causa non determinata.' }]);
  });

  it('resolves placeholders against the context', async () => {
    const rows = await renderedRows(
      unknownCaseFallback('Titolo.', [['Ambiente', '{{vars.env}}']]),
      new Map([['env', 'prod']]),
    );
    assert.deepStrictEqual(rows[1], { field: 'Ambiente', value: 'prod' });
  });

  it('drops rows whose value the run never produced, instead of leaking the placeholder', async () => {
    // Regression: a fallback spelling the prefix differently got no
    // `missingValue`, so raw {{vars.x}} reached the operator and the trace.
    const rows = await renderedRows(unknownCaseFallback('Titolo.', [['Ambiente', '{{vars.env}}']]), new Map());
    assert.strictEqual(rows.length, 1);
    assert.ok(!JSON.stringify(rows).includes('{{vars.'));
  });
});
