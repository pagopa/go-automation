import type { LambdaAlarmConfig } from '../types/LambdaAlarmConfig.js';
import type { LambdaQueryProfile } from '../profiles/LambdaQueryProfile.js';
import { isValidRegex } from '@pagopa/go-common/utils';
import {
  assertStepDescriptorIds,
  failAlarmConfig,
  type AlarmConfigValidationContext,
} from '../../../builders/alarmConfigValidation.js';
import { REQUEST_ID_FILTER_PLACEHOLDER } from '../helpers/lambdaRequestIdFilter.js';
import { LAMBDA_PIPELINE_STEP_IDS } from './LAMBDA_PIPELINE_STEP_IDS.js';
import { lambdaDownstreamReadStepId } from './lambdaDownstreamReadStepId.js';

const REQUEST_ID_PLACEHOLDER = REQUEST_ID_FILTER_PLACEHOLDER;

function context(config: LambdaAlarmConfig): AlarmConfigValidationContext {
  return { builderName: 'createLambdaAlarmRunbook', runbookId: config.id };
}

function fail(config: LambdaAlarmConfig, message: string): never {
  failAlarmConfig(context(config), message);
}

/**
 * Fail-fast when the invocation query template lacks the requestId
 * placeholder: without it the invocation/downstream queries cannot filter
 * by requestId and would scan the whole window.
 */
function validateInvocationPlaceholder(config: LambdaAlarmConfig, profile: LambdaQueryProfile): void {
  if (!profile.invocationQueryTemplate.includes(REQUEST_ID_PLACEHOLDER)) {
    fail(
      config,
      `query profile "${profile.id}" invocationQueryTemplate must contain the "${REQUEST_ID_PLACEHOLDER}" ` +
        'placeholder, otherwise the invocation/downstream queries cannot filter by requestId.',
    );
  }
}

/**
 * Validates downstream declarations and error patterns: unique non-empty
 * names, valid regexes, and pattern targets that point to a declared
 * downstream.
 */
function validateDownstreams(config: LambdaAlarmConfig): void {
  const downstreamNames = new Set<string>();
  for (const downstream of config.downstreams ?? []) {
    if (downstream.name.trim() === '') {
      fail(config, 'a downstream has an empty name.');
    }
    if (downstreamNames.has(downstream.name)) {
      fail(config, `downstream "${downstream.name}" is declared more than once.`);
    }
    downstreamNames.add(downstream.name);
  }

  for (const pattern of config.downstreamErrorPatterns ?? []) {
    if (!isValidRegex(pattern.pattern)) {
      fail(config, `downstream error pattern for target "${pattern.target}" is not a valid regex: ${pattern.pattern}`);
    }
    if (!downstreamNames.has(pattern.target)) {
      fail(
        config,
        `downstream error pattern targets "${pattern.target}" which is not a declared downstream ` +
          '(add it to config.downstreams).',
      );
    }
  }
}

/**
 * Fail-fast on step-id collisions: duplicate/reserved hook ids and
 * downstream read ids that collide with reserved pipeline ids.
 */
function validateNoStepIdCollisions(config: LambdaAlarmConfig): void {
  const reserved: ReadonlySet<string> = new Set(Object.values(LAMBDA_PIPELINE_STEP_IDS));
  const hookIds = assertStepDescriptorIds(context(config), config.hooks, reserved, 'hook');

  // Only a downstream with logs is read, so only its read occupies a step id.
  for (const downstream of config.downstreams ?? []) {
    if (downstream.logGroup === undefined) continue;
    const stepId = lambdaDownstreamReadStepId(downstream.name);
    if (reserved.has(stepId)) {
      fail(
        config,
        `downstream "${downstream.name}" produces step id "${stepId}" which collides with a reserved pipeline step id.`,
      );
    }
    if (hookIds.has(stepId)) {
      fail(config, `downstream "${downstream.name}" produces step id "${stepId}" which collides with a preStep id.`);
    }
  }
}

/**
 * Runs all build-time validations for a Lambda alarm config, mirroring the
 * API Gateway builder validations. Throws a descriptive `Error` on the first
 * problem (fail-fast at build time, not at runtime).
 *
 * @param config - The Lambda alarm configuration
 * @param profile - The resolved query profile
 */
export function validateLambdaAlarmConfig(config: LambdaAlarmConfig, profile: LambdaQueryProfile): void {
  validateInvocationPlaceholder(config, profile);
  validateDownstreams(config);
  validateNoStepIdCollisions(config);
}
