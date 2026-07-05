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
export function assertRunbookCapability(input: ExecuteRunbookInput, workerRevision = 'unknown'): void {
  const resolved = AUTOMATIC_RUNBOOK_REGISTRY.resolveByKey(input.runbook.key);
  const descriptor = resolved?.descriptor;
  const matches =
    descriptor?.version === input.runbook.version &&
    descriptor.definitionDigest === input.runbook.definitionDigest &&
    descriptor.alarmNames.includes(input.alarmEvent.alarmName);
  if (matches) return;

  const details: RunbookCapabilityMismatchDetails = {
    requested: input.runbook,
    workerRevision,
    ...(descriptor === undefined
      ? {}
      : {
          actual: {
            key: descriptor.key,
            version: descriptor.version,
            definitionDigest: descriptor.definitionDigest,
            alarmNames: descriptor.alarmNames,
          },
        }),
  };
  return throwCapabilityMismatch(details);
}

function throwCapabilityMismatch(details: RunbookCapabilityMismatchDetails): never {
  throw Object.assign(new Error(`Runbook capability mismatch: ${JSON.stringify(details)}`), {
    workerFailureCode: 'RUNBOOK_CAPABILITY_MISMATCH' as const,
    details,
  });
}
