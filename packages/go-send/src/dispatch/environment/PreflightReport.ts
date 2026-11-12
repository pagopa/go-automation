import type { DispatchGroup } from '../model/DispatchGroup.js';

/**
 * Outcome of a successful environment preflight (§7.4.3).
 */
export interface PreflightReport {
  /** The group the notifications are sent on behalf of, when `groupId` is set. */
  readonly group?: DispatchGroup;
  /** Active groups of the PA (shown when `groupId` is missing). */
  readonly activeGroups: ReadonlyArray<DispatchGroup>;
  readonly warnings: ReadonlyArray<string>;
}
