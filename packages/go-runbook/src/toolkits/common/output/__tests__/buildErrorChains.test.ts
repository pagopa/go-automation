import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { CoverageEntry } from '../../../../engine/types/CoverageEntry.js';
import type { IdentifierObservation } from '../../../../engine/types/IdentifierObservation.js';
import type { KnownCase } from '../../../../engine/types/KnownCase.js';
import type { RunbookExecutionResult } from '../../../../engine/types/RunbookExecutionResult.js';
import { buildErrorChains } from '../buildErrorChains.js';
import { createTestExecutionResult } from '../../../../__tests__/helpers/createTestExecutionResult.js';

function knownCase(id: string): KnownCase {
  return {
    id,
    description: id,
    condition: { type: 'compare', ref: 'vars.x', operator: '==', value: 'y' },
    action: { type: 'log', level: 'info', title: id },
  };
}

/** A window-level result with one detection per case, each with its observations. */
function windowResult(
  coverage: ReadonlyArray<CoverageEntry>,
  detections: ReadonlyArray<readonly [string, ReadonlyArray<IdentifierObservation>]>,
): RunbookExecutionResult {
  return {
    ...createTestExecutionResult({ coverage }),
    detections: detections.map(([id, observations]) => ({ knownCase: knownCase(id), evidenceRows: 1, observations })),
  };
}

const NAMED_GAP: CoverageEntry = {
  stepId: 'query-execution-logs',
  complete: false,
  reason: 'unavailable',
  identifiers: [{ kind: 'requestId', value: 'req-1' }],
};

describe('buildErrorChains without an error tree', () => {
  it('makes incomplete only the chain that observed an identifier a gap names', () => {
    const chains = buildErrorChains(
      windowResult(
        [NAMED_GAP],
        [
          ['named', [{ kind: 'requestId', value: 'req-1' }]],
          ['other', [{ kind: 'requestId', value: 'req-2' }]],
        ],
      ),
    );
    assert.deepStrictEqual(
      chains.map((chain) => [chain.nodes[0]?.caseIds[0], chain.incompleteEvidence]),
      [
        ['named', true],
        ['other', false],
      ],
    );
  });

  it('makes incomplete a chain without usable observations: only a trace id, or a request id not valid', () => {
    const chains = buildErrorChains(
      windowResult(
        [NAMED_GAP],
        [
          ['trace-only', [{ kind: 'traceId', value: '1-abcdef01-000000000000000000000001' }]],
          ['invalid', [{ kind: 'requestId', value: 'req.42' }]],
          ['none', []],
        ],
      ),
    );
    assert.deepStrictEqual(
      chains.map((chain) => chain.incompleteEvidence),
      [true, true, true],
    );
  });

  it('makes every chain incomplete with a gap of the whole read, and none without gaps', () => {
    const whole = buildErrorChains(
      windowResult(
        [{ stepId: 'query', complete: false, reason: 'saturated' }],
        [['one', [{ kind: 'requestId', value: 'req-2' }]]],
      ),
    );
    assert.deepStrictEqual(
      whole.map((chain) => chain.incompleteEvidence),
      [true],
    );
    const none = buildErrorChains(windowResult([], [['one', []]]));
    assert.deepStrictEqual(
      none.map((chain) => chain.incompleteEvidence),
      [false],
    );
  });
});
