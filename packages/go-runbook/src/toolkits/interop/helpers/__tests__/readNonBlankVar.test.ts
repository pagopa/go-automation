import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NOOP_RUNBOOK_REPORTER } from '../../../../engine/reporting/NOOP_RUNBOOK_REPORTER.js';
import type { RunbookContext } from '../../../../engine/types/RunbookContext.js';
import { interopLogsQueryOptions } from '../interopLogsQueryOptions.js';
import { readNonBlankVar } from '../readNonBlankVar.js';

function context(signal?: AbortSignal): RunbookContext {
  return {
    executionId: 'helpers-test',
    startedAt: new Date('2026-10-06T18:05:00.000Z'),
    stepResults: new Map(),
    vars: new Map([
      ['present', '  value  '],
      ['blank', '   '],
    ]),
    params: new Map(),
    logs: [],
    services: { reporter: NOOP_RUNBOOK_REPORTER },
    recoveredErrors: [],
    ...(signal === undefined ? {} : { signal }),
  };
}

describe('readNonBlankVar', () => {
  it('trims the value and treats a blank or missing variable as absent', () => {
    assert.equal(readNonBlankVar(context(), 'present'), 'value');
    assert.equal(readNonBlankVar(context(), 'blank'), undefined);
    assert.equal(readNonBlankVar(context(), 'missing'), undefined);
  });
});

describe('interopLogsQueryOptions', () => {
  it('searches the configured profiles and forwards the abort signal only when present', () => {
    assert.deepEqual(interopLogsQueryOptions(context()), { logGroupResolutionMode: 'search-configured-profiles' });
    const signal = new AbortController().signal;
    assert.equal(interopLogsQueryOptions(context(signal)).signal, signal);
  });
});
