import type { Core } from '@go-automation/go-common';
import { valueToString } from '@go-automation/go-common/core';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import { resolveAnalysisMatcher } from './resolveAnalysisMatcher.js';
import type { ResolvedAnalysisMatcher } from './resolveAnalysisMatcher.js';
import { resolveMode } from './resolveMode.js';
import type { RtaCheckMode } from './resolveMode.js';

interface CoverageRunOptions {
  readonly mode: 'coverage';
}

interface AnalysesRunOptions {
  readonly mode: 'analyses';
  readonly analysisMatcher: ResolvedAnalysisMatcher;
}

export type RunOptions = CoverageRunOptions | AnalysesRunOptions;

type AnalysisMatcherResolver = typeof resolveAnalysisMatcher;

/**
 * Validates the run mode and, only for `analyses`, the V2 matcher before any
 * credential is requested, so a relevant configuration mistake surfaces immediately.
 *
 * @param logger - GOScript logger, used to report the invalid value
 * @param config - Validated script configuration
 * @param resolveMatcher - Matcher factory, injectable for isolation tests
 * @returns The resolved options, or `undefined` when the configuration is invalid
 */
export function resolveRunOptions(
  logger: Core.GOLogger,
  config: GoRtaCheckConfig,
  resolveMatcher: AnalysisMatcherResolver = resolveAnalysisMatcher,
): RunOptions | undefined {
  try {
    const mode: RtaCheckMode = resolveMode(config.mode);
    return mode === 'coverage' ? { mode } : { mode, analysisMatcher: resolveMatcher(config) };
  } catch (error) {
    logger.error(valueToString(error));
    return undefined;
  }
}
