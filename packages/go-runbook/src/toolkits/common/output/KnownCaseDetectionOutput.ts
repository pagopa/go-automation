import type { IdentifierObservation } from '../../../engine/index.js';

export interface KnownCaseDetectionOutput {
  readonly caseId: string;
  readonly description: string;
  readonly firstSeenAt?: string;
  readonly lastSeenAt?: string;
  readonly evidenceRows: number;
  readonly errors: number;
  readonly resolvedMessage?: string;
  readonly resolvedMessages?: ReadonlyArray<string>;
  readonly observations: ReadonlyArray<IdentifierObservation>;
}
