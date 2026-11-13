import type { RunbookMetadata } from '../../../../../engine/types/RunbookMetadata.js';
import type { RunbookAnalysisDefaults } from '../../../analysis/RunbookAnalysisDefaults.js';
import type { KnownCase } from '../../../../../engine/types/KnownCase.js';
import type { PipelineHook } from '../../../../../engine/types/PipelineHook.js';
import type { LambdaPipelineAnchor } from './LambdaPipelineAnchor.js';
import type { CaseAction } from '../../../../../engine/types/CaseAction.js';
import type { LambdaFunction } from './LambdaFunction.js';
import type { LambdaDownstream } from './LambdaDownstream.js';
import type { DownstreamErrorPattern } from './DownstreamErrorPattern.js';
import type { LambdaQueryProfile } from '../profiles/LambdaQueryProfile.js';
import type { Step } from '../../../../../engine/types/Step.js';

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
  /** Optional account-aware error query with the canonical `query-lambda-errors` step id. */
  readonly errorQueryStep?: Step;
  /** Optional account-aware invocation query with the canonical `query-lambda-invocation` step id. */
  readonly invocationQueryStep?: Step;
  /** Extra analysis references; the builder always prepends the primary resource. */
  readonly analysisDefaults?: RunbookAnalysisDefaults;
  /**
   * Custom steps spliced into the canonical pipeline at named points.
   *
   * See {@link LambdaPipelineAnchor} for the available positions.
   */
  readonly hooks?: ReadonlyArray<PipelineHook<LambdaPipelineAnchor>>;
  /**
   * Action executed when no known case matches. When omitted, the factory
   * generates a default action summarising the collected vars.
   */
  readonly fallbackAction?: CaseAction;
  /** Query profile to assemble the pipeline (product wrappers pass theirs, e.g. SEND_LAMBDA_PROFILE). */
  readonly queryProfile: LambdaQueryProfile;
  /** Optional anti-loop iteration limit forwarded to the engine. */
  readonly maxIterations?: number;
}
