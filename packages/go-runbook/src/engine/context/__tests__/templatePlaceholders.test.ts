import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { interpolatePlaceholders } from '../templatePlaceholders.js';

const SOURCES = {
  vars: new Map([
    ['code', '500'],
    ['name', "O'Brien"],
  ]),
  params: new Map([['alarmName', 'my-alarm']]),
};

describe('interpolatePlaceholders', () => {
  it('replaces vars and params placeholders and leaves everything else literal', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['status={{vars.code}}', 'status=500'],
      ['alarm={{params.alarmName}}', 'alarm=my-alarm'],
      ['{{params.alarmName}} status={{vars.code}}', 'my-alarm status=500'],
      ['{{vars.missing}}', '{{vars.missing}}'],
      ['{{env.HOME}}', '{{env.HOME}}'],
      ['plain text', 'plain text'],
    ];
    for (const [template, expected] of cases) {
      assert.strictEqual(interpolatePlaceholders(template, SOURCES), expected, template);
    }
  });

  it('applies missingValue to unresolved placeholders and escape to resolved values', () => {
    assert.strictEqual(
      interpolatePlaceholders('{{vars.a}} / {{params.b}}', SOURCES, { missingValue: 'n/a' }),
      'n/a / n/a',
    );
    assert.strictEqual(
      interpolatePlaceholders('name={{vars.name}}', SOURCES, { escape: (value) => value.replace(/'/g, "''") }),
      "name=O''Brien",
    );
  });

  it('terminates quickly on adversarial input (many unclosed placeholders)', () => {
    // Guards against a regression to a backtracking implementation: the scan must stay O(N).
    const stress = '{{vars.'.repeat(50_000);
    const start = performance.now();
    assert.strictEqual(interpolatePlaceholders(stress, SOURCES), stress);
    assert.ok(performance.now() - start < 1_000);
  });
});
