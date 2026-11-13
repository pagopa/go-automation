/**
 * Resume-cache invalidation: builds a fingerprint of everything that can change
 * a runbook's V1 result, so a cached entry is reused only when it still matches
 * the current runbook definition and execution inputs.
 *
 * The runbook is rebuilt from the registry (a pure `() => Runbook`, no AWS) and
 * its serializable structure is hashed, alongside ids/versions, schema version,
 * AWS profiles/target and the occurrence time window.
 */
import { createHash } from 'node:crypto';

import { safeJsonStringify } from '@pagopa/go-common/utils';
import { RUNBOOK_REGISTRY } from '@pagopa/go-runbook/inventory';
import { resolveOccurrenceTimeWindow } from '@pagopa/go-runbook/runtime';
import { collectRunbookSteps, type Runbook } from '@pagopa/go-runbook';
import type { AwsAccountSelection } from '@pagopa/go-runbook/toolkits/common';

import type { RunbookCacheDescriptor } from './RunbookCacheDescriptor.js';
import type { CachedRunbookAccounts } from './CachedRunbookAccounts.js';
import type { CachedRunbookMeta } from './CachedRunbookMeta.js';

/**
 * Local cache-format version. Bump to invalidate **all** cached entries at once
 * (e.g. after a change to the fingerprint inputs or a `go-runbook` upgrade whose
 * effect is not otherwise captured by the structural hash).
 */
const CACHE_FINGERPRINT_VERSION = 5;

/** `RunbookOutput` schema version this build expects; mismatch ⇒ cache miss. */
const EXPECTED_OUTPUT_SCHEMA_VERSION = '1.0.0';

/** SHA-256 hex digest of a string. */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Hashes the serializable structure of a runbook (functions are ignored). */
function hashRunbookDefinition(runbook: Runbook): string {
  return sha256(safeJsonStringify(runbook, { maxDepth: 64 }));
}

/** A step that declares the logical accounts it reads (`OperationalStep.accountSelections`). */
interface AccountSelectingStep {
  accountSelections?(): ReadonlyArray<AwsAccountSelection>;
}

/** Logical accounts declared by the runbook's steps, nested and action steps included, sorted. */
function declaredLogicalAccounts(runbook: Runbook): ReadonlyArray<string> {
  const accounts = new Set<string>();
  for (const step of collectRunbookSteps(runbook)) {
    for (const selection of (step as AccountSelectingStep).accountSelections?.() ?? []) {
      for (const account of selection.accounts) accounts.add(account);
    }
  }
  return [...accounts].sort((a, b) => a.localeCompare(b));
}

/**
 * Builds the runbook for `alarmName` from the registry and returns its identity
 * and structural hash. Returns `undefined` when no runbook is registered.
 *
 * @param alarmName - Alarm name (= runbook id)
 * @returns The runbook cache descriptor, or `undefined` if unregistered
 */
export function resolveRunbookCacheDescriptor(alarmName: string): RunbookCacheDescriptor | undefined {
  const builder = RUNBOOK_REGISTRY.get(alarmName);
  if (builder === undefined) {
    return undefined;
  }
  const runbook = builder();
  return {
    id: runbook.metadata.id,
    version: runbook.metadata.version,
    hash: hashRunbookDefinition(runbook),
    occurrenceTimeWindow: { ...resolveOccurrenceTimeWindow(runbook) },
    logicalAccounts: declaredLogicalAccounts(runbook),
  };
}

/**
 * Assembles the {@link CachedRunbookMeta} for one occurrence.
 *
 * @param descriptor - The per-run runbook descriptor
 * @param awsProfiles - AWS profiles used for the execution
 * @param firedAt - Occurrence timestamp
 * @param awsAccountId - AWS account targeted by the occurrence
 * @param awsRegion - AWS region targeted by the occurrence
 * @param accounts - Logical-account inputs, for runbooks that declare logical accounts
 * @returns The metadata whose hash is the cache fingerprint
 */
export function buildCacheMeta(
  descriptor: RunbookCacheDescriptor,
  awsProfiles: ReadonlyArray<string>,
  firedAt: string,
  awsAccountId: string,
  awsRegion: string,
  accounts?: CachedRunbookAccounts,
): CachedRunbookMeta {
  return {
    fingerprintVersion: CACHE_FINGERPRINT_VERSION,
    runbookId: descriptor.id,
    runbookVersion: descriptor.version,
    runbookHash: descriptor.hash,
    outputSchemaVersion: EXPECTED_OUTPUT_SCHEMA_VERSION,
    awsAccountId,
    awsRegion,
    awsProfiles: [...awsProfiles].sort((a, b) => a.localeCompare(b)),
    firedAt,
    occurrenceTimeWindow: { ...descriptor.occurrenceTimeWindow },
    ...(accounts === undefined ? {} : { accounts }),
  };
}

/**
 * Computes the cache fingerprint (SHA-256 of the metadata).
 *
 * @param meta - The cache metadata
 * @returns Hex fingerprint string
 */
export function computeFingerprint(meta: CachedRunbookMeta): string {
  return sha256(safeJsonStringify(meta, { maxDepth: 16 }));
}
