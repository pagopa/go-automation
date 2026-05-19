import type { StepDescriptor } from '../../types/StepDescriptor.js';

import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwQueryProfile } from '../profiles/ApiGwQueryProfile.js';
import type { ProfilePreStepSpec } from '../profiles/specs/ProfilePreStepSpec.js';
import { createLambdaDurationProbePreSteps } from './createLambdaDurationProbePreSteps.js';

/**
 * Resolves profile-level pre-step declarations and runbook-local pre-steps
 * into the ordered descriptor list wired by the API Gateway builder.
 *
 * @param config - Runbook configuration
 * @param profile - Resolved query profile
 * @returns Effective pre-step descriptors
 */
export function resolveApiGwPreSteps(
  config: ApiGwAlarmConfig,
  profile: ApiGwQueryProfile,
): ReadonlyArray<StepDescriptor> {
  const profilePreSteps = config.includeProfilePreSteps === false ? [] : materializeProfilePreSteps(profile);
  return [...profilePreSteps, ...(config.preSteps ?? [])];
}

function materializeProfilePreSteps(profile: ApiGwQueryProfile): ReadonlyArray<StepDescriptor> {
  const descriptors: StepDescriptor[] = [];
  for (const spec of profile.preSteps ?? []) {
    descriptors.push(...materializeProfilePreStep(profile, spec));
  }
  return descriptors;
}

function materializeProfilePreStep(
  profile: ApiGwQueryProfile,
  spec: ProfilePreStepSpec,
): ReadonlyArray<StepDescriptor> {
  return createLambdaDurationProbePreSteps({
    logGroup: spec.logGroup,
    schema: profile.serviceLog.schema,
    traceMetadata: {
      ...spec.traceMetadata,
      queryProfileId: profile.id,
    },
    ...(spec.idPrefix !== undefined ? { idPrefix: spec.idPrefix } : {}),
    ...(spec.label !== undefined ? { label: spec.label } : {}),
    ...(spec.varPrefix !== undefined ? { varPrefix: spec.varPrefix } : {}),
    ...(spec.thresholdMs !== undefined ? { thresholdMs: spec.thresholdMs } : {}),
    ...(spec.timeRangeFromParams !== undefined ? { timeRangeFromParams: spec.timeRangeFromParams } : {}),
    ...(spec.queryTemplate !== undefined ? { queryTemplate: spec.queryTemplate } : {}),
  });
}
