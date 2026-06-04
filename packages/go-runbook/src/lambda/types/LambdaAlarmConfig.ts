import type { RunbookMetadata } from '../../types/RunbookMetadata.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { StepDescriptor } from '../../types/StepDescriptor.js';
import type { CaseAction } from '../../actions/CaseAction.js';
import type { LambdaFunction } from './LambdaFunction.js';
import type { LambdaDownstream } from './LambdaDownstream.js';
import type { DownstreamErrorPattern } from './DownstreamErrorPattern.js';
import type { LambdaQueryProfile } from '../profiles/LambdaQueryProfile.js';

/**
 * Declarative configuration consumed by `createLambdaAlarmRunbook`.
 *
 * The factory assembles a fully validated `Runbook` from these inputs, so
 * runbook authors only provide alarm-specific data (entry Lambda,
 * downstreams, known cases). Mirrors `apigw.ApiGwAlarmConfig`, minus the
 * concepts that do not exist for Lambda (authorizer gate, execution log).
 */
export interface LambdaAlarmConfig {
  /** Unique runbook identifier (= full alarm name). */
  readonly id: string;
  /** Metadata (the `id` is taken from {@link LambdaAlarmConfig.id}). */
  readonly metadata: Omit<RunbookMetadata, 'id'>;
  /** Entry Lambda whose log group is the primary source. */
  readonly lambda: LambdaFunction;
  /** Downstream microservices reachable from the Lambda. */
  readonly downstreams?: ReadonlyArray<LambdaDownstream>;
  /** Error-message patterns used to route to a downstream. */
  readonly downstreamErrorPatterns?: ReadonlyArray<DownstreamErrorPattern>;
  /** Known cases evaluated against the resulting context. */
  readonly knownCases: ReadonlyArray<KnownCase>;
  /** Custom steps inserted between the invocation query and the downstream loop. */
  readonly preSteps?: ReadonlyArray<StepDescriptor>;
  /**
   * Action executed when no known case matches. When omitted, the factory
   * generates a default action summarising the collected vars.
   */
  readonly fallbackAction?: CaseAction;
  /** Query profile to assemble the pipeline. Defaults to SEND. */
  readonly queryProfile?: LambdaQueryProfile;
  /** Optional anti-loop iteration limit forwarded to the engine. */
  readonly maxIterations?: number;
}
