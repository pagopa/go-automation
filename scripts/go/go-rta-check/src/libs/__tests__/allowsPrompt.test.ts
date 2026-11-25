import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { allowsPrompt } from '../allowsPrompt.js';
import type { GoRtaCheckConfig } from '../../types/GoRtaCheckConfig.js';

const CASES: ReadonlyArray<{
  readonly name: string;
  readonly config: GoRtaCheckConfig;
  readonly tty: boolean;
  readonly expected: boolean;
}> = [
  { name: 'asks on an interactive terminal', config: {}, tty: true, expected: true },
  {
    name: 'honours the explicit --non-interactive switch',
    config: { nonInteractive: true },
    tty: true,
    expected: false,
  },
  { name: 'never asks when no answer could arrive', config: {}, tty: false, expected: false },
  {
    name: 'preserves the historical flag-driven convention (alarm name + period)',
    config: { alarmName: 'pn-alarm', dateFrom: '2026-01-01T00:00:00Z' },
    tty: true,
    expected: false,
  },
  { name: 'keeps asking with only the alarm name', config: { alarmName: 'pn-alarm' }, tty: true, expected: true },
  {
    name: 'keeps asking with only the period',
    config: { dateFrom: '2026-01-01T00:00:00Z' },
    tty: true,
    expected: true,
  },
  {
    name: 'treats empty strings as absent, so they do not silence the wizard',
    config: { alarmName: '', dateFrom: '' },
    tty: true,
    expected: true,
  },
];

describe('allowsPrompt', () => {
  for (const { name, config, tty, expected } of CASES) {
    it(name, () => {
      assert.strictEqual(allowsPrompt(config, tty), expected);
    });
  }
});
