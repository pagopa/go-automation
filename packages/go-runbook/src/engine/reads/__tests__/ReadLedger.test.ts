import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ReadLedger } from '../ReadLedger.js';
import type { CoverageReason } from '../../types/CoverageReason.js';
import type { ReadState } from '../../types/ReadState.js';
import type { StepCoverage } from '../../types/StepCoverage.js';

const REQUEST_A = { kind: 'requestId', value: 'req-a' } as const;
const REQUEST_B = { kind: 'requestId', value: 'req-b' } as const;

function gap(reason?: CoverageReason, extra: Partial<StepCoverage> = {}): StepCoverage {
  return { complete: false, ...(reason !== undefined ? { reason } : {}), ...extra };
}

describe('ReadLedger', () => {
  describe('states', () => {
    const cases: ReadonlyArray<readonly [CoverageReason | undefined, ReadState]> = [
      ['saturated', 'saturated'],
      ['unavailable', 'unavailable'],
      ['manual', 'unavailable'],
      ['skipped', 'skipped'],
      [undefined, 'unavailable'],
    ];
    for (const [reason, state] of cases) {
      it(`maps the reason ${String(reason)} to ${state}`, () => {
        const ledger = new ReadLedger();
        ledger.recordStep(ledger.window, 'read', [gap(reason)]);
        assert.strictEqual(ledger.view(ledger.window).stateOf('read'), state);
      });
    }

    it('gives a failed read the state unavailable, with a bounded detail', () => {
      const ledger = new ReadLedger();
      ledger.recordFailure(ledger.window, 'read', `${'word '.repeat(60)}tail`);
      assert.strictEqual(ledger.view(ledger.window).stateOf('read'), 'unavailable');
      const [entry] = ledger.entries();
      assert.ok((entry?.detail ?? '').length <= 200);
      assert.ok(!(entry?.detail ?? '').endsWith('wor'));
    });

    it('gives a read with several gaps the most severe, and a read without gaps queried', () => {
      const ledger = new ReadLedger();
      ledger.recordStep(ledger.window, 'read', [gap('saturated'), gap('skipped'), gap('unavailable')]);
      const reads = ledger.view(ledger.window);
      assert.strictEqual(reads.stateOf('read'), 'skipped');
      assert.strictEqual(reads.isComplete('read'), false);
      assert.strictEqual(reads.stateOf('other'), 'queried');
      assert.strictEqual(reads.isComplete('other'), true);
    });

    it('ignores the complete entries', () => {
      const ledger = new ReadLedger();
      ledger.recordStep(ledger.window, 'read', [{ complete: true, reason: 'saturated' }]);
      assert.strictEqual(ledger.view(ledger.window).stateOf('read'), 'queried');
      assert.deepStrictEqual(ledger.entries(), []);
    });
  });

  describe('identifiers', () => {
    it('matches the same kind and value, never another kind with the same value', () => {
      const ledger = new ReadLedger();
      ledger.recordStep(ledger.window, 'read', [gap('saturated', { identifiers: [REQUEST_A] })]);
      const reads = ledger.view(ledger.window);
      assert.strictEqual(reads.stateOf('read', REQUEST_A), 'saturated');
      assert.strictEqual(reads.stateOf('read', { kind: 'requestId', value: ' req-a ' }), 'saturated');
      assert.strictEqual(reads.stateOf('read', { kind: 'traceId', value: 'req-a' }), 'queried');
      assert.strictEqual(reads.stateOf('read', REQUEST_B), 'queried');
      assert.strictEqual(reads.hasGapFor('read', REQUEST_A), true);
      assert.strictEqual(reads.hasGapFor('read', REQUEST_B), false);
      assert.deepStrictEqual(ledger.entries()[0]?.identifiers, [REQUEST_A]);
      assert.strictEqual(ledger.windowIncomplete(), false);
    });

    it('treats an empty list, or an invalid identifier, as a gap of the whole read', () => {
      for (const identifiers of [[], [REQUEST_A, { kind: 'requestId', value: 'req.42' }]] as const) {
        const ledger = new ReadLedger();
        ledger.recordStep(ledger.window, 'read', [gap('saturated', { identifiers })]);
        const reads = ledger.view(ledger.window);
        assert.strictEqual(reads.stateOf('read', REQUEST_B), 'saturated');
        assert.strictEqual(reads.hasGapFor('read', REQUEST_A), false);
        assert.strictEqual(ledger.entries()[0]?.identifiers, undefined);
        assert.strictEqual(ledger.windowIncomplete(), true);
      }
    });

    it('counts the gaps of the whole read for an identifier, but not for the targeted question', () => {
      const ledger = new ReadLedger();
      ledger.recordStep(ledger.window, 'read', [gap('unavailable', { identifiers: [REQUEST_A] }), gap('skipped')]);
      const reads = ledger.view(ledger.window);
      assert.strictEqual(reads.stateOf('read', REQUEST_A), 'skipped');
      assert.strictEqual(reads.stateOf('read', REQUEST_B), 'skipped');
      assert.strictEqual(reads.hasGapFor('read', REQUEST_B), false);
    });

    it('gives an identifier the state unavailable when the read failed as a whole', () => {
      const ledger = new ReadLedger();
      ledger.recordFailure(ledger.window, 'read', 'boom');
      assert.strictEqual(ledger.view(ledger.window).stateOf('read', REQUEST_A), 'unavailable');
    });
  });

  describe('attribution and entries', () => {
    it('makes two scopes that reuse the same entry incomplete, with one entry', () => {
      const ledger = new ReadLedger();
      const shared = gap('saturated');
      const first = ledger.createScope(ledger.window);
      const second = ledger.createScope(ledger.window);
      ledger.recordStep(first, 'probe', [shared]);
      ledger.recordStep(second, 'probe', [shared]);
      assert.strictEqual(ledger.isNodeIncomplete(first, {}), true);
      assert.strictEqual(ledger.isNodeIncomplete(second, {}), true);
      assert.strictEqual(ledger.entries().length, 1);
    });

    it('keeps two independent reads with the same error as two entries, in the same step or in two steps', () => {
      const ledger = new ReadLedger();
      ledger.recordStep(ledger.window, 'read', [gap('unavailable', { detail: 'boom' })]);
      ledger.recordStep(ledger.window, 'read', [gap('unavailable', { detail: 'boom' })]);
      const shared = gap('saturated');
      ledger.recordStep(ledger.window, 'one', [shared]);
      ledger.recordStep(ledger.window, 'two', [shared]);
      assert.deepStrictEqual(
        ledger.entries().map((entry) => entry.stepId),
        ['read', 'read', 'one', 'two'],
      );
    });

    it('lets a node and a routing scope see the gaps of the window, never the reverse', () => {
      const ledger = new ReadLedger();
      ledger.recordStep(ledger.window, 'window-read', [gap('saturated')]);
      const node = ledger.createScope(ledger.window);
      const routing = ledger.createScope(node);
      ledger.recordStep(node, 'node-read', [gap('unavailable')]);
      assert.strictEqual(ledger.view(routing).stateOf('window-read'), 'saturated');
      assert.strictEqual(ledger.view(routing).stateOf('node-read'), 'unavailable');
      assert.strictEqual(ledger.view(ledger.window).stateOf('node-read'), 'queried');
      assert.strictEqual(ledger.hasOwnGaps(routing), false);
      assert.strictEqual(ledger.hasOwnGaps(node), true);
    });

    it('makes a node incomplete when a gap of the window names an identifier of its correlation', () => {
      const ledger = new ReadLedger();
      ledger.recordStep(ledger.window, 'execution-log', [gap('saturated', { identifiers: [REQUEST_A] })]);
      const named = ledger.createScope(ledger.window);
      const other = ledger.createScope(ledger.window);
      assert.strictEqual(ledger.isNodeIncomplete(named, { requestId: 'req-a', traceId: 'T1' }), true);
      assert.strictEqual(ledger.isNodeIncomplete(other, { requestId: 'req-b' }), false);
    });
  });

  describe('descents', () => {
    it('gives a descent the worst of its attempts, and a level the worst of its descents', () => {
      const ledger = new ReadLedger();
      const node = ledger.createScope(ledger.window);
      const first = ledger.openDescent(node, 'svc');
      const second = ledger.openDescent(node, 'svc');
      assert.strictEqual(ledger.descentState(first), undefined);
      const complete = ledger.recordBatch('read-svc', [{ kind: 'traceId', value: 'T1' }], { success: true, rows: [] });
      const saturated = ledger.recordBatch('read-svc', [{ kind: 'traceId', value: 'T1b' }], {
        success: true,
        rows: [],
        coverage: [gap('saturated')],
      });
      const failed = ledger.recordBatch('read-svc', [{ kind: 'traceId', value: 'T2' }], {
        success: false,
        error: 'boom',
        rows: [],
      });
      ledger.attemptDescent(first, complete, { kind: 'traceId', value: 'T1' });
      assert.strictEqual(ledger.levelState(node, 'svc'), 'queried');
      ledger.attemptDescent(first, saturated, { kind: 'traceId', value: 'T1b' });
      ledger.attemptDescent(second, failed, { kind: 'traceId', value: 'T2' });
      assert.strictEqual(ledger.descentState(first), 'saturated');
      assert.strictEqual(ledger.descentState(second), 'unavailable');
      assert.strictEqual(ledger.levelState(node, 'svc'), 'unavailable');
      assert.strictEqual(ledger.levelState(node, 'other'), 'queried');
      // A gap of a batch concerns its descents, never a scope.
      assert.strictEqual(ledger.hasOwnGaps(node), false);
      assert.deepStrictEqual(
        ledger.entries().map((entry) => entry.detail),
        ['1 identificatori', '1 identificatori: boom'],
      );
    });

    it('applies a gap of a batch that names identifiers only to their descents', () => {
      const ledger = new ReadLedger();
      const node = ledger.createScope(ledger.window);
      const named = ledger.openDescent(node, 'svc');
      const other = ledger.openDescent(node, 'svc');
      const batch = ledger.recordBatch('read-svc', [REQUEST_A, REQUEST_B], {
        success: true,
        rows: [],
        coverage: [gap('saturated', { identifiers: [REQUEST_A] })],
      });
      ledger.attemptDescent(named, batch, REQUEST_A);
      ledger.attemptDescent(other, batch, REQUEST_B);
      assert.strictEqual(ledger.descentState(named), 'saturated');
      assert.strictEqual(ledger.descentState(other), 'queried');
    });

    it('keeps the skipped state of every descent, with one entry per level, and a cycle without entry', () => {
      const ledger = new ReadLedger();
      const node = ledger.createScope(ledger.window);
      const descents = [ledger.openDescent(node, 'svc'), ledger.openDescent(node, 'svc')];
      for (const descent of descents) ledger.skipDescent(descent, 'read-svc');
      const cycle = ledger.openDescent(node, 'down');
      ledger.markDescent(cycle, 'cycle');
      assert.deepStrictEqual(
        descents.map((descent) => ledger.descentState(descent)),
        ['skipped', 'skipped'],
      );
      assert.strictEqual(ledger.descentState(cycle), 'cycle');
      assert.deepStrictEqual(
        ledger.entries().map((entry) => [entry.stepId, entry.source, entry.reason]),
        [['read-svc', 'svc', 'skipped']],
      );
    });
  });
});
