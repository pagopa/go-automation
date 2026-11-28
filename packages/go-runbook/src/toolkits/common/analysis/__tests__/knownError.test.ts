import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderLogActionText } from '../reporting/renderLogAction.js';
import { knownError, type KnownErrorSpec } from '../knownError.js';

const BASE = {
  code: 'foo-500',
  description: '[DOWNSTREAM FOO] HTTP 500 durante la chiamata',
  condition: { type: 'exists', ref: 'steps.query-foo' },
  resolution: 'Monitorare il downstream FOO e attenderne il ripristino.',
  analysis: { proposedStatus: 'COMPLETED', analysisType: 'ANALYZABLE' },
} as const;

const EMPTY = { vars: new Map<string, string>(), params: new Map<string, string>() };

/** The action as the operator reads it, placeholders left verbatim. */
function messageOf(spec: KnownErrorSpec): string {
  const action = knownError(spec).action;
  assert.strictEqual(action.type, 'log');
  return action.type === 'log' ? renderLogActionText(action, EMPTY) : '';
}

describe('knownError', () => {
  it('sends the resolution to both destinations from a single declaration', () => {
    const built = knownError(BASE);
    // The console row an operator reads…
    assert.ok(messageOf(BASE).includes(`Risoluzione: ${BASE.resolution}`));
    // …and the draft published to Watchtower.
    assert.strictEqual(built.analysis?.resolution, BASE.resolution);
  });

  it('renders the resolution first, before the evidence rows', () => {
    const lines = messageOf({ ...BASE, details: [['Servizio', 'pn-foo']] }).split('\n');
    assert.ok(lines[1]?.startsWith('Risoluzione:'));
    assert.strictEqual(lines[2], 'Servizio: pn-foo');
  });

  it('emits the prefix the executor keys off, with the description or an explicit shorter title', () => {
    assert.ok(messageOf(BASE).startsWith(`[CASO NOTO] ${BASE.description}`));
    const message = messageOf({ ...BASE, title: '[DOWNSTREAM FOO] HTTP 500' });
    assert.ok(message.startsWith('[CASO NOTO] [DOWNSTREAM FOO] HTTP 500\n'));
    // The full wording still reaches the trace through the description.
    assert.strictEqual(knownError({ ...BASE, title: 'x' }).description, BASE.description);
  });

  it('marks the action as a known error at info level unless a level is given', () => {
    const action = knownError(BASE).action;
    assert.ok(action.type === 'log' && action.renderAs === 'known-error');
    assert.ok(action.type === 'log' && action.level === 'info');
    const warn = knownError({ ...BASE, level: 'warn' }).action;
    assert.ok(warn.type === 'log' && warn.level === 'warn');
  });

  it('stores the placeholder as a template, leaving the executor to resolve it per row', () => {
    const action = knownError({ ...BASE, details: [['Errore', '{{vars.fooErrorMsg}}']] }).action;
    assert.ok(action.type === 'log');
    assert.deepStrictEqual(action.type === 'log' ? action.details?.at(-1) : undefined, [
      'Errore',
      '{{vars.fooErrorMsg}}',
    ]);
  });

  it('carries the remaining analysis directives through untouched', () => {
    const built = knownError({ ...BASE, analysis: { ...BASE.analysis, downstreams: ['FOO'], errorDetails: 'x' } });
    assert.deepStrictEqual(built.analysis, {
      resolution: BASE.resolution,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: ['FOO'],
      errorDetails: 'x',
    });
  });
});
