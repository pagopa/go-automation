import type { StepDescriptor } from '../../types/StepDescriptor.js';
import type { LambdaAlarmConfig } from '../types/LambdaAlarmConfig.js';
import type { LambdaDownstream } from '../types/LambdaDownstream.js';
import type { DownstreamErrorPattern } from '../types/DownstreamErrorPattern.js';
import type { LambdaQueryProfile } from '../profiles/LambdaQueryProfile.js';
import type { LambdaRunbookContext } from '../output/LambdaRunbookContext.js';
import { SEND_LAMBDA_PROFILE } from '../profiles/SEND_LAMBDA_PROFILE.js';
import { validateLambdaAlarmConfig } from './validations.js';

/** Resolved build context for {@link createLambdaAlarmRunbook}. */
export interface LambdaAlarmBuildContext {
  readonly profile: LambdaQueryProfile;
  readonly downstreams: ReadonlyArray<LambdaDownstream>;
  readonly downstreamErrorPatterns: ReadonlyArray<DownstreamErrorPattern>;
  readonly preSteps: ReadonlyArray<StepDescriptor>;
  readonly runbookContext: LambdaRunbookContext;
}

/**
 * Normalises a {@link LambdaAlarmConfig} into the data the factory needs:
 * resolves the query profile and the optional collections, and builds the
 * structured runbook context.
 *
 * @param config - The Lambda alarm configuration
 * @returns The resolved build context
 */
export function resolveLambdaAlarmBuildContext(config: LambdaAlarmConfig): LambdaAlarmBuildContext {
  const profile = config.queryProfile ?? SEND_LAMBDA_PROFILE;
  validateLambdaAlarmConfig(config, profile);
  const downstreams = config.downstreams ?? [];
  const runbookContext: LambdaRunbookContext = {
    kind: 'lambda',
    lambda: config.lambda,
    downstreams,
    queryProfileId: profile.id,
  };
  return {
    profile,
    downstreams,
    downstreamErrorPatterns: config.downstreamErrorPatterns ?? [],
    preSteps: config.preSteps ?? [],
    runbookContext,
  };
}
