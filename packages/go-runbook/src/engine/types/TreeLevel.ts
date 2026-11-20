import type { StepDescriptor } from './StepDescriptor.js';
import type { TreeEnumeratorFn } from './TreeEnumeratorFn.js';
import type { TreeExclusion } from './TreeExclusion.js';
import type { TreeLevelReader } from './TreeLevelReader.js';
import type { TreeRowAttributionFn } from './TreeRowAttributionFn.js';
import type { TreeRowIdentityFn } from './TreeRowIdentityFn.js';
import type { TreeSecondAttemptFn } from './TreeSecondAttemptFn.js';
import type { TreeVarOwnershipFn } from './TreeVarOwnershipFn.js';

/**
 * A level of the error tree: a read, an enumerator that divides the rows into nodes, and steps run for every node.
 *
 * The root level reads the window with the ordinary steps of the runbook and enumerates from the context; every
 * other level reads, for its parents, the identifiers they descended with.
 */
export interface TreeLevel {
  /** Name of the level: `api-gateway`, `pn-delivery`, `downstream-logs`. */
  readonly target: string;
  /** Prefix of the vars published on the parent after a descent (`<varPrefix>LookupState`, `<varPrefix>LogCount`). */
  readonly varPrefix?: string;
  /** Grouped read; absent for the root level. */
  readonly read?: TreeLevelReader;
  /** Identifiers per grouped read (default 50). */
  readonly batchSize?: number;
  /** Which identifier a row belongs to; required with `read`. */
  readonly attribute?: TreeRowAttributionFn;
  /** Identity of a row; rows without it are all distinct. */
  readonly rowIdentity?: TreeRowIdentityFn;
  /** Second read of the same level for a parent, with a better identifier found by the first. */
  readonly secondAttempt?: TreeSecondAttemptFn;
  readonly enumerate: TreeEnumeratorFn;
  /** Steps run in the context of every node of the level; they decide its descents. */
  readonly perNode?: ReadonlyArray<StepDescriptor>;
  /** Steps run on every node of the level once its descents are concluded. */
  readonly afterDescend?: ReadonlyArray<StepDescriptor>;
  /** Diagnoses a case of the parent may require to be absent from this level's read. */
  readonly exclusions?: ReadonlyArray<TreeExclusion>;
  /** Step ids of the window whose rows belong to the nodes of this level (root level: the access log). */
  readonly scopedSteps?: ReadonlyArray<string>;
  /** Variables the nodes of this level write: a case reading them belongs to this level. */
  readonly ownsVar?: TreeVarOwnershipFn;
}
