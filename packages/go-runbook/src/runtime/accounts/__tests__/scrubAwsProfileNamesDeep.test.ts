import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { scrubAwsProfileNamesDeep } from '../scrubAwsProfileNamesDeep.js';

describe('scrubAwsProfileNamesDeep', () => {
  it('scrubs every string and masks the profile fields whole, without modifying the value', () => {
    const value = {
      input: { awsProfiles: ['reader:fallback', 'other'] },
      telemetry: { queryExecutions: [{ queryId: 'q', profile: 'reader' }] },
      errors: ['StartQuery access denied (profile: reader)', 'denied for other'],
      count: 2,
      execution: { status: 'completed', startedAt: '2026-11-20T10:00:42.123Z' },
      message: 'reader',
    };

    const scrubbed = scrubAwsProfileNamesDeep(value, ['reader:fallback', 'other', 'reader', 'completed', '00']);

    assert.deepStrictEqual(scrubbed, {
      input: { awsProfiles: ['<profile>', '<profile>'] },
      telemetry: { queryExecutions: [{ queryId: 'q', profile: '<profile>' }] },
      errors: ['StartQuery access denied', 'denied for <profile>'],
      count: 2,
      execution: { status: 'completed', startedAt: '2026-11-20T10:00:42.123Z' },
      message: '<profile>',
    });
    assert.strictEqual(value.telemetry.queryExecutions[0]?.profile, 'reader');
  });

  it('scrubs a reason and free text that starts with a timestamp, keeping only whole timestamps', () => {
    const scrubbed = scrubAwsProfileNamesDeep(
      {
        outcome: { reason: 'StartQuery access denied (profile: reader)' },
        note: '2026-11-20T10:00:42Z profile: reader failed',
        at: '2026-11-20T10:00:42Z',
      },
      ['reader', '00'],
    );
    assert.deepStrictEqual(scrubbed, {
      outcome: { reason: 'StartQuery access denied' },
      note: '2026-11-20T10:<profile>:42Z profile: <profile> failed',
      at: '2026-11-20T10:00:42Z',
    });
  });

  it('keeps the enum value of a coverage reason, even when a profile has the same name', () => {
    const scrubbed = scrubAwsProfileNamesDeep(
      { coverage: { sources: [{ stepId: 'q', complete: false, reason: 'unavailable' }] } },
      ['unavailable'],
    );
    assert.deepStrictEqual(scrubbed, {
      coverage: { sources: [{ stepId: 'q', complete: false, reason: 'unavailable' }] },
    });
  });

  it('scrubs a failed outcome reason as free text and keeps a Logs Insights timestamp whole', () => {
    const scrubbed = scrubAwsProfileNamesDeep(
      { outcome: { kind: 'failed', reason: 'unavailable' }, row: { '@timestamp': '2026-11-19 10:00:42.123' } },
      ['unavailable', '00'],
    );
    assert.deepStrictEqual(scrubbed, {
      outcome: { kind: 'failed', reason: '<profile>' },
      row: { '@timestamp': '2026-11-19 10:00:42.123' },
    });
  });
});
