import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { allowsPrompt } from '../allowsPrompt.js';

const TTY = true;
const NO_TTY = false;

describe('allowsPrompt', () => {
  it('allows the wizard to ask on an interactive terminal', () => {
    assert.strictEqual(allowsPrompt({}, TTY), true);
  });

  it('honours the explicit --non-interactive switch', () => {
    assert.strictEqual(allowsPrompt({ nonInteractive: true }, TTY), false);
  });

  it('never asks when no answer could arrive', () => {
    assert.strictEqual(allowsPrompt({}, NO_TTY), false);
  });

  it('preserves the historical flag-driven convention (alarm name + period)', () => {
    assert.strictEqual(allowsPrompt({ alarmName: 'pn-alarm', dateFrom: '2026-01-01T00:00:00Z' }, TTY), false);
  });

  it('keeps asking when only one half of that convention is present', () => {
    assert.strictEqual(allowsPrompt({ alarmName: 'pn-alarm' }, TTY), true);
    assert.strictEqual(allowsPrompt({ dateFrom: '2026-01-01T00:00:00Z' }, TTY), true);
  });

  it('treats empty strings as absent, so they do not silence the wizard', () => {
    assert.strictEqual(allowsPrompt({ alarmName: '', dateFrom: '' }, TTY), true);
  });
});
