import type { Core } from '@go-automation/go-common';
import { valueToString } from '@go-automation/go-common/core';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import { resolveAnalysisMatcher } from './resolveAnalysisMatcher.js';
import type { ResolvedAnalysisMatcher } from './resolveAnalysisMatcher.js';
import { resolveMode } from './resolveMode.js';
import type { RtaCheckMode } from './resolveMode.js';

/** I modi di sola lettura non hanno opzioni proprie: bastano credenziali e censimento. */
interface CoverageRunOptions {
  readonly mode: 'coverage';
}

interface ReadinessRunOptions {
  readonly mode: 'readiness';
}

interface AnalysesRunOptions {
  readonly mode: 'analyses';
  readonly analysisMatcher: ResolvedAnalysisMatcher;
  readonly concurrency: number;
}

export type { AnalysesRunOptions };

export type RunOptions = CoverageRunOptions | ReadinessRunOptions | AnalysesRunOptions;

type AnalysisMatcherResolver = typeof resolveAnalysisMatcher;

function resolveConcurrency(value: number | undefined): number {
  const concurrency = value ?? 1;
  if (!Number.isFinite(concurrency) || !Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency non valida: ${String(value)}. Deve essere un intero finito maggiore o uguale a 1.`);
  }
  return concurrency;
}

/**
 * Validates the run mode and, only for `analyses`, the V2 matcher before the
 * analyses workflow begins, so a relevant configuration mistake surfaces immediately.
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
    if (mode === 'coverage') return { mode };
    if (mode === 'readiness') return { mode };
    return {
      mode,
      concurrency: resolveConcurrency(config.concurrency),
      analysisMatcher: resolveMatcher(config),
    };
  } catch (error) {
    logger.error(valueToString(error));
    return undefined;
  }
}
