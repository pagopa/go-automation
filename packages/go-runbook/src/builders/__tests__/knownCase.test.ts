import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderLogActionText } from '../../actions/renderLogAction.js';
import { knownCase, type KnownCaseSpec } from '../knownCase.js';

const BASE = {
  id: 'foo-500',
  description: '[DOWNSTREAM FOO] HTTP 500 durante la chiamata',
  priority: 130,
  condition: { type: 'exists', ref: 'steps.query-foo' },
  resolution: 'Monitorare il downstream FOO e attenderne il ripristino.',
  analysis: { proposedStatus: 'COMPLETED', analysisType: 'ANALYZABLE' },
} as const;

const EMPTY = { vars: new Map<string, string>(), params: new Map<string, string>() };

/** The action as the operator reads it, placeholders left verbatim. */
function messageOf(spec: KnownCaseSpec): string {
  const action = knownCase(spec).action;
  assert.strictEqual(action.type, 'log');
  return action.type === 'log' ? renderLogActionText(action, EMPTY) : '';
}

describe('knownCase', () => {
  it('sends the resolution to both destinations from a single declaration', () => {
    const built = knownCase(BASE);
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

  it('emits the prefix the executor keys off, with the description as title', () => {
    assert.ok(messageOf(BASE).startsWith(`[CASO NOTO] ${BASE.description}`));
  });

  it('uses an explicit title when the console needs a shorter wording', () => {
    const message = messageOf({ ...BASE, title: '[DOWNSTREAM FOO] HTTP 500' });
    assert.ok(message.startsWith('[CASO NOTO] [DOWNSTREAM FOO] HTTP 500\n'));
    // The full wording still reaches the trace through the description.
    assert.strictEqual(knownCase({ ...BASE, title: 'x' }).description, BASE.description);
  });

  it('marks the action as a known case at info level by default', () => {
    const action = knownCase(BASE).action;
    assert.ok(action.type === 'log' && action.renderAs === 'known-case');
    assert.ok(action.type === 'log' && action.level === 'info');
  });

  it('honours an explicit level', () => {
    const action = knownCase({ ...BASE, level: 'warn' }).action;
    assert.ok(action.type === 'log' && action.level === 'warn');
  });

  it('stores the placeholder as a template, leaving the executor to resolve it per row', () => {
    const action = knownCase({ ...BASE, details: [['Errore', '{{vars.fooErrorMsg}}']] }).action;
    assert.ok(action.type === 'log');
    assert.deepStrictEqual(action.type === 'log' ? action.details?.at(-1) : undefined, [
      'Errore',
      '{{vars.fooErrorMsg}}',
    ]);
  });

  it('carries the remaining analysis directives through untouched', () => {
    const built = knownCase({ ...BASE, analysis: { ...BASE.analysis, downstreams: ['FOO'], errorDetails: 'x' } });
    assert.deepStrictEqual(built.analysis, {
      resolution: BASE.resolution,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: ['FOO'],
      errorDetails: 'x',
    });
  });
});
