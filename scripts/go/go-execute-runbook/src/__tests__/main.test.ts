import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveDryRunTimeoutMs } from '../libs/resolveDryRunTimeoutMs.js';
import {
  CLI_SYNTHETIC_DELIVERY_GRACE_MS,
  LEGACY_SYNTHETIC_DELIVERY_GRACE_MS,
  syntheticDelivery,
} from '../libs/syntheticDelivery.js';
import { validateModeCombination } from '../libs/validateModeCombination.js';

const EXECUTION_ID = '0192c000-0000-7000-8000-000000000001';
const NOW_MS = Date.parse('2026-06-26T10:00:00.000Z');

describe('syntheticDelivery', () => {
  it('uses the long legacy budget for --execution-id executions', () => {
    const delivery = syntheticDelivery(EXECUTION_ID, {
      graceMs: LEGACY_SYNTHETIC_DELIVERY_GRACE_MS,
      nowMs: NOW_MS,
    });

    assert.strictEqual(delivery.sqsMessageId, `cli:${EXECUTION_ID}`);
    assert.strictEqual(delivery.approximateReceiveCount, 1);
    assert.strictEqual(Date.parse(delivery.workerDeadlineAt) - NOW_MS, 12 * 60_000);
  });

  it('uses the short start grace for CLI-created executions', () => {
    const delivery = syntheticDelivery(EXECUTION_ID, {
      graceMs: CLI_SYNTHETIC_DELIVERY_GRACE_MS,
      nowMs: NOW_MS,
    });

    assert.strictEqual(Date.parse(delivery.workerDeadlineAt) - NOW_MS, 120_000);
  });
});

describe('resolveDryRunTimeoutMs', () => {
  it('accepts an omitted or positive integer timeout', () => {
    assert.strictEqual(resolveDryRunTimeoutMs(undefined), undefined);
    assert.strictEqual(resolveDryRunTimeoutMs(30_000), 30_000);
  });

  it('rejects non-positive dry-run timeouts', () => {
    assert.throws(() => resolveDryRunTimeoutMs(0), /--dry-run-timeout-ms/);
    assert.throws(() => resolveDryRunTimeoutMs(-1), /--dry-run-timeout-ms/);
  });
});

describe('validateModeCombination', () => {
  it('allows --apply none for legacy --execution-id runs', () => {
    assert.doesNotThrow(() => validateModeCombination(EXECUTION_ID, false, 'SHADOW'));
  });

  it('still rejects applying known or all in legacy --execution-id runs', () => {
    assert.throws(() => validateModeCombination(EXECUTION_ID, false, 'APPLY_KNOWN'), /--apply/);
  });
});
