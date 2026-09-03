import type { LambdaAlarmConfig } from '../types/LambdaAlarmConfig.js';
import type { LambdaQueryProfile } from '../profiles/LambdaQueryProfile.js';
import { isValidRegex } from '../helpers/matchDownstreamErrorPattern.js';
import {
  assertKnownCaseStepRefs,
  assertStepDescriptorIds,
  failAlarmConfig,
  type AlarmConfigValidationContext,
} from '../../validation/alarmConfigValidation.js';

const REQUEST_ID_PLACEHOLDER = '{{vars.lambdaRequestId}}';

function context(config: LambdaAlarmConfig): AlarmConfigValidationContext {
  return { builderName: 'createLambdaAlarmRunbook', runbookId: config.id };
}

function fail(config: LambdaAlarmConfig, message: string): never {
  failAlarmConfig(context(config), message);
}

/**
 * Deterministic set of step ids wired into the Lambda pipeline for a config.
 */
function computeWiredStepIds(config: LambdaAlarmConfig): ReadonlySet<string> {
  const ids = new Set<string>([
    'prepare-lambda-section',
    'query-lambda-errors',
    'parse-lambda-errors',
    'query-lambda-invocation',
    'analyze-lambda-invocation',
  ]);
  for (const hook of config.hooks ?? []) {
    ids.add(hook.step.id);
  }
  for (const downstream of config.downstreams ?? []) {
    ids.add(`query-${downstream.name}`);
  }
  return ids;
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
 * Fail-fast on step-id collisions: duplicate/reserved preStep ids and
 * downstream query ids that collide with reserved pipeline ids.
 */
function validateNoStepIdCollisions(config: LambdaAlarmConfig): void {
  const reserved = computeWiredStepIds({ ...config, hooks: [], downstreams: [] });
  const preStepIds = assertStepDescriptorIds(context(config), config.hooks, reserved, 'hook');

  for (const downstream of config.downstreams ?? []) {
    const stepId = `query-${downstream.name}`;
    if (reserved.has(stepId)) {
      fail(
        config,
        `downstream "${downstream.name}" produces step id "${stepId}" which collides with a reserved pipeline step id.`,
      );
    }
    if (preStepIds.has(stepId)) {
      fail(config, `downstream "${downstream.name}" produces step id "${stepId}" which collides with a preStep id.`);
    }
  }
}

/**
 * Fail-fast when a known case condition references a `steps.X` step that is
 * not wired in this runbook (typically a typo or a missing downstream).
 */
function validateKnownCaseStepRefs(config: LambdaAlarmConfig): void {
  assertKnownCaseStepRefs(
    context(config),
    config.knownCases,
    computeWiredStepIds(config),
    '. Remove the reference or declare the step/downstream.',
  );
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
  validateKnownCaseStepRefs(config);
}
