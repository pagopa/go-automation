import { AUTOMATIC_RUNBOOK_REGISTRY } from 'go-analyze-alarm/api';

import type { ExecuteRunbookInput } from '../types/ExecuteRunbookInput.js';

export interface RunbookCapabilityMismatchDetails {
  readonly requested: {
    readonly key: string;
    readonly version: string;
    readonly definitionDigest: string;
    readonly catalogRevision: string;
    readonly workerRevision: string;
  };
  readonly workerRevision: string;
  readonly actual?: {
    readonly key: string;
    readonly version: string;
    readonly definitionDigest: string;
    readonly alarmNames: ReadonlyArray<string>;
  };
}

export type RunbookCapabilityMismatchError = Error & {
  readonly workerFailureCode: 'RUNBOOK_CAPABILITY_MISMATCH';
  readonly details: RunbookCapabilityMismatchDetails;
};

/** Validates capability pinning before lifecycle start or any AWS query. */
export function assertRunbookCapability(input: ExecuteRunbookInput, workerRevision?: string): void {
  const reportedWorkerRevision = workerRevision ?? input.runbook.workerRevision;
  const resolved = AUTOMATIC_RUNBOOK_REGISTRY.resolveByKey(input.runbook.key);
  const descriptor = resolved?.descriptor;
  if (descriptor === undefined) {
    return throwCapabilityMismatch({ requested: input.runbook, workerRevision: reportedWorkerRevision });
  }
  const matches =
    (workerRevision === undefined || workerRevision === input.runbook.workerRevision) &&
    descriptor.version === input.runbook.version &&
    descriptor.definitionDigest === input.runbook.definitionDigest &&
    descriptor.alarmNames.includes(input.alarmEvent.alarmName);
  if (matches) return;

  const details: RunbookCapabilityMismatchDetails = {
    requested: input.runbook,
    workerRevision: reportedWorkerRevision,
    actual: {
      key: descriptor.key,
      version: descriptor.version,
      definitionDigest: descriptor.definitionDigest,
      alarmNames: descriptor.alarmNames,
    },
  };
  return throwCapabilityMismatch(details);
}

function throwCapabilityMismatch(details: RunbookCapabilityMismatchDetails): never {
  const requested = details.requested;
  const registered =
    details.actual === undefined
      ? 'not registered'
      : `${details.actual.key}@${details.actual.version} digest=${details.actual.definitionDigest}`;
  const message =
    `Runbook capability mismatch: requested=${requested.key}@${requested.version} ` +
    `digest=${requested.definitionDigest} requestedWorker=${requested.workerRevision}; ` +
    `worker=${details.workerRevision}; registered=${registered}`;
  throw Object.assign(new Error(message), {
    workerFailureCode: 'RUNBOOK_CAPABILITY_MISMATCH' as const,
    details,
  });
}
