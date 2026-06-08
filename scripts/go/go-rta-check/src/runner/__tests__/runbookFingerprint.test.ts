import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RUNBOOK_REGISTRY } from 'go-analyze-alarm/api';

import type { RunbookCacheDescriptor } from '../RunbookCacheDescriptor.js';
import { buildCacheMeta, computeFingerprint, resolveRunbookCacheDescriptor } from '../runbookFingerprint.js';

const descriptor: RunbookCacheDescriptor = { id: 'r', version: '1.0.0', hash: 'h0' };

describe('runbookFingerprint', () => {
  it('buildCacheMeta sorts profiles and carries the descriptor fields', () => {
    const meta = buildCacheMeta(descriptor, ['b', 'a'], '2026-01-01T00:00:00Z');
    assert.deepEqual([...meta.awsProfiles], ['a', 'b']);
    assert.equal(meta.runbookId, 'r');
    assert.equal(meta.runbookVersion, '1.0.0');
    assert.equal(meta.runbookHash, 'h0');
    assert.equal(meta.firedAt, '2026-01-01T00:00:00Z');
    assert.equal(typeof meta.windowMinutes, 'number');
  });

  it('computeFingerprint is deterministic and profile-order-insensitive', () => {
    const a = computeFingerprint(buildCacheMeta(descriptor, ['a', 'b'], 'T'));
    const b = computeFingerprint(buildCacheMeta(descriptor, ['b', 'a'], 'T'));
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  it('computeFingerprint changes when any fingerprint input changes', () => {
    const base = computeFingerprint(buildCacheMeta(descriptor, ['a'], 'T'));
    assert.notEqual(base, computeFingerprint(buildCacheMeta({ ...descriptor, hash: 'h1' }, ['a'], 'T')));
    assert.notEqual(base, computeFingerprint(buildCacheMeta({ ...descriptor, version: '2.0.0' }, ['a'], 'T')));
    assert.notEqual(base, computeFingerprint(buildCacheMeta({ ...descriptor, id: 'other' }, ['a'], 'T')));
    assert.notEqual(base, computeFingerprint(buildCacheMeta(descriptor, ['a', 'c'], 'T')));
    assert.notEqual(base, computeFingerprint(buildCacheMeta(descriptor, ['a'], 'T2')));
  });

  it('resolveRunbookCacheDescriptor builds a stable hash for a registered alarm', () => {
    const known = [...RUNBOOK_REGISTRY.keys()][0];
    if (known === undefined) throw new Error('expected at least one registered runbook');

    const resolved = resolveRunbookCacheDescriptor(known);
    if (resolved === undefined) throw new Error('expected a descriptor for a registered alarm');
    assert.ok(resolved.id.length > 0);
    assert.match(resolved.hash, /^[0-9a-f]{64}$/);
    // Rebuilding the same runbook yields the same structural hash.
    assert.equal(resolveRunbookCacheDescriptor(known)?.hash, resolved.hash);
  });

  it('resolveRunbookCacheDescriptor returns undefined for an unregistered alarm', () => {
    assert.equal(resolveRunbookCacheDescriptor('does-not-exist-alarm'), undefined);
  });
});
