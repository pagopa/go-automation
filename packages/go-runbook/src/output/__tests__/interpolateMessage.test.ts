import { describe, it } from 'node:test';
import assert from 'node:assert';

import { interpolateMessage } from '../interpolateMessage.js';

describe('interpolateMessage', () => {
  it('interpolates a single vars placeholder', () => {
    const out = interpolateMessage('status={{vars.code}}', {
      vars: new Map([['code', '500']]),
      params: new Map(),
    });
    assert.strictEqual(out, 'status=500');
  });

  it('interpolates a single params placeholder', () => {
    const out = interpolateMessage('alarm={{params.alarmName}}', {
      vars: new Map(),
      params: new Map([['alarmName', 'my-alarm']]),
    });
    assert.strictEqual(out, 'alarm=my-alarm');
  });

  it('interpolates multiple placeholders in a single string', () => {
    const out = interpolateMessage('{{params.alarmName}} status={{vars.code}}', {
      vars: new Map([['code', '500']]),
      params: new Map([['alarmName', 'foo']]),
    });
    assert.strictEqual(out, 'foo status=500');
  });

  it('keeps unresolved placeholders literal by default', () => {
    const out = interpolateMessage('{{vars.missing}}', {
      vars: new Map(),
      params: new Map(),
    });
    assert.strictEqual(out, '{{vars.missing}}');
  });

  it('replaces unresolved placeholders with missingValue when provided', () => {
    const out = interpolateMessage(
      '{{vars.a}} / {{params.b}}',
      { vars: new Map(), params: new Map() },
      { missingValue: 'n/a' },
    );
    assert.strictEqual(out, 'n/a / n/a');
  });

  it('leaves text without placeholders untouched', () => {
    const out = interpolateMessage('plain text without placeholders', {
      vars: new Map(),
      params: new Map(),
    });
    assert.strictEqual(out, 'plain text without placeholders');
  });

  it('ignores placeholders with unknown source prefix', () => {
    // `{{vars.x}}` / `{{params.x}}` are the only supported forms; an
    // unrelated `{{env.HOME}}` must not be touched.
    const out = interpolateMessage('{{env.HOME}}', {
      vars: new Map(),
      params: new Map(),
    });
    assert.strictEqual(out, '{{env.HOME}}');
  });

  it('terminates quickly on adversarial input that previously triggered polynomial backtracking', () => {
    // Many `{{vars.` prefixes with NO closing `}}`. With the old
    // `[^}]+` pattern, each starting position triggered O(N) backtracks
    // → overall O(N²) wall-clock. With `[^}{]+` the engine fails fast
    // at every starting position because the inner `{` is rejected.
    const stress = '{{vars.'.repeat(50_000);
    const start = Date.now();
    const out = interpolateMessage(stress, { vars: new Map(), params: new Map() });
    const elapsed = Date.now() - start;
    assert.strictEqual(out, stress);
    // Conservative cap: with the fix this completes in single-digit ms.
    // Set the threshold high enough to not flake on slow CI while still
    // catching a regression to the polynomial behaviour.
    assert.ok(elapsed < 1_000, `interpolateMessage took ${elapsed}ms on adversarial input`);
  });
});
