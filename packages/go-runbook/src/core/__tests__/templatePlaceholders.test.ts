import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { interpolatePlaceholders } from '../templatePlaceholders.js';

describe('interpolatePlaceholders', () => {
  it('interpolates a single vars placeholder', () => {
    const out = interpolatePlaceholders('status={{vars.code}}', {
      vars: new Map([['code', '500']]),
      params: new Map(),
    });
    assert.strictEqual(out, 'status=500');
  });

  it('interpolates a single params placeholder', () => {
    const out = interpolatePlaceholders('alarm={{params.alarmName}}', {
      vars: new Map(),
      params: new Map([['alarmName', 'my-alarm']]),
    });
    assert.strictEqual(out, 'alarm=my-alarm');
  });

  it('interpolates multiple placeholders in a single string', () => {
    const out = interpolatePlaceholders('{{params.alarmName}} status={{vars.code}}', {
      vars: new Map([['code', '500']]),
      params: new Map([['alarmName', 'foo']]),
    });
    assert.strictEqual(out, 'foo status=500');
  });

  it('keeps unresolved placeholders literal by default', () => {
    const out = interpolatePlaceholders('{{vars.missing}}', {
      vars: new Map(),
      params: new Map(),
    });
    assert.strictEqual(out, '{{vars.missing}}');
  });

  it('replaces unresolved placeholders with missingValue when provided', () => {
    const out = interpolatePlaceholders(
      '{{vars.a}} / {{params.b}}',
      { vars: new Map(), params: new Map() },
      { missingValue: 'n/a' },
    );
    assert.strictEqual(out, 'n/a / n/a');
  });

  it('applies the escape transformer to resolved values', () => {
    const out = interpolatePlaceholders(
      'name={{vars.name}}',
      { vars: new Map([['name', "O'Brien"]]), params: new Map() },
      { escape: (value) => value.replace(/'/g, "''") },
    );
    assert.strictEqual(out, "name=O''Brien");
  });

  it('leaves text without placeholders untouched', () => {
    const out = interpolatePlaceholders('plain text without placeholders', {
      vars: new Map(),
      params: new Map(),
    });
    assert.strictEqual(out, 'plain text without placeholders');
  });

  it('ignores placeholders with unknown source prefix', () => {
    // `{{vars.x}}` / `{{params.x}}` are the only supported forms; an
    // unrelated `{{env.HOME}}` must not be touched.
    const out = interpolatePlaceholders('{{env.HOME}}', {
      vars: new Map(),
      params: new Map(),
    });
    assert.strictEqual(out, '{{env.HOME}}');
  });

  it('terminates quickly on adversarial input (many unclosed placeholders)', () => {
    // Many `{{vars.` prefixes with NO closing `}}`. The index-based scanner
    // advances linearly past each malformed opener, so the cost stays O(N)
    // — this guards against a regression to a backtracking implementation.
    const stress = '{{vars.'.repeat(50_000);
    const start = Date.now();
    const out = interpolatePlaceholders(stress, { vars: new Map(), params: new Map() });
    const elapsed = Date.now() - start;
    assert.strictEqual(out, stress);
    assert.ok(elapsed < 1_000, `interpolatePlaceholders took ${elapsed}ms on adversarial input`);
  });
});
