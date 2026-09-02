import type { CaseAction } from '../actions/CaseAction.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { PipelineHook } from '../types/PipelineHook.js';
import type { Runbook } from '../types/Runbook.js';
import type { RunbookAnalysisDefaults } from '../types/RunbookAnalysisDefaults.js';
import type { RunbookBuilder } from './RunbookBuilder.js';
import { omitUndefined } from '@go-automation/go-common/core';

import { orphanHookAnchors } from './applyPipelineHooks.js';

/**
 * The part of an alarm config every toolkit builder ends by consuming.
 * Declared structurally so each family can pass its own config object.
 */
export interface AlarmRunbookTailConfig {
  readonly id: string;
  readonly knownCases: ReadonlyArray<KnownCase>;
  readonly fallbackAction?: CaseAction;
  readonly analysisDefaults?: RunbookAnalysisDefaults;
  readonly maxIterations?: number;
}

/** Builds the fallback used when the config declares none. */
type DefaultFallbackFn = () => CaseAction;

/**
 * Hook wiring, for the pipelines that declare anchors. The three travel
 * together: without hooks there is nothing to check and no name to report.
 */
interface AlarmRunbookAnchors<TAnchor extends string> {
  /** Hooks the toolkit accepted from its config. */
  readonly hooks: ReadonlyArray<PipelineHook<TAnchor>>;
  /** Anchors the pipeline actually reached while wiring its steps. */
  readonly reached: ReadonlySet<TAnchor>;
  /** Pipeline name used in the orphan-anchor error (e.g. `Lambda`). */
  readonly pipelineName: string;
}

/** What a toolkit must supply on top of its config to close a runbook. */
export interface FinishAlarmRunbookOptions<TAnchor extends string> {
  /**
   * Builds the fallback used when the config declares none. A function, not a
   * value, so a config that brings its own `fallbackAction` never pays for
   * building the default — and never inherits a failure from it.
   */
  readonly defaultFallback: DefaultFallbackFn;
  /** Structured context describing the analysed component. */
  readonly runbookContext: unknown;
  /**
   * Name of the component under analysis, recorded as the draft's PRIMARY
   * resource. `type` stays undeclared until the Fase 0 coverage check confirms
   * the censused ResourceType name — a wrong type would block the apply, while
   * omitting it never does.
   */
  readonly primaryResource: string;
  /**
   * Default documental runbook name, overridden by the one in
   * `config.analysisDefaults` when the runbook declares its own.
   */
  readonly defaultRunbookName?: string;
  /** Hook wiring; omit for a pipeline that declares no anchors. */
  readonly anchors?: AlarmRunbookAnchors<TAnchor>;
}

/**
 * Closes an alarm runbook: known cases, fallback, structured context,
 * analysis defaults, iteration cap, orphan-anchor check, build.
 *
 * Every toolkit builder ends with these seven steps in this order. Keeping them
 * in one place means a new rule — a field that must always reach
 * `analysisDefaults`, say — is added once instead of in five builders, where
 * forgetting one compiles cleanly and only shows up in production.
 *
 * @param builder - Builder already carrying the family-specific steps
 * @param config - The alarm config being built
 * @param options - What the toolkit supplies on top of the config
 * @returns The validated runbook
 * @throws When a hook targets an anchor the pipeline never reached
 *
 * @example
 * ```typescript
 * return finishAlarmRunbook(builder, config, {
 *   defaultFallback: defaultLambdaUnknownCaseFallback(ctx.downstreams),
 *   runbookContext: { ...ctx.runbookContext },
 *   primaryResource: config.lambda.name,
 *   hooks: ctx.hooks,
 *   reachedAnchors,
 *   pipelineName: 'Lambda',
 * });
 * ```
 */
export function finishAlarmRunbook<TAnchor extends string = never>(
  builder: RunbookBuilder,
  config: AlarmRunbookTailConfig,
  options: FinishAlarmRunbookOptions<TAnchor>,
): Runbook {
  for (const knownCase of config.knownCases) {
    builder.knownCase(knownCase);
  }

  builder.fallback(config.fallbackAction ?? options.defaultFallback());
  builder.runbookContext(options.runbookContext);
  builder.analysisDefaults({
    ...omitUndefined({ runbookName: options.defaultRunbookName }),
    ...config.analysisDefaults,
    resources: [{ name: options.primaryResource, role: 'PRIMARY' }, ...(config.analysisDefaults?.resources ?? [])],
  });

  if (config.maxIterations !== undefined) {
    builder.maxIterations(config.maxIterations);
  }

  if (options.anchors !== undefined) {
    const { hooks, reached, pipelineName } = options.anchors;
    const orphans = orphanHookAnchors(hooks, reached);
    if (orphans.length > 0) {
      throw new Error(
        `[${config.id}] hooks target anchors the ${pipelineName} pipeline never reaches: ${orphans.join(', ')}.`,
      );
    }
  }

  return builder.build();
}
