import type { RunbookKind } from '../types/RunbookKind.js';

/**
 * Catalog identity of a runbook, computed from its registration and from the
 * runbook its builder produces.
 *
 * This is the shape the catalog publishes, so its field names are part of an
 * integration contract even though the type is declared here: renaming a field
 * changes what consumers receive.
 */
export interface RunbookDescriptor {
  readonly key: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly team: string;
  readonly kind: RunbookKind;
  readonly categories: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly alarmNames: readonly [string, ...string[]];
  /** `sha256-…` over the canonical JSON of the built runbook. */
  readonly definitionDigest: string;
}
