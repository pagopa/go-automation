import type { Runbook } from '../../../engine/index.js';
import { orphanHookAnchors } from '../../../engine/internal.js';
import type { AlarmRunbookBuilder } from './AlarmRunbookBuilder.js';
import { omitUndefined } from '@pagopa/go-common/utils';
import { assertKnownCaseStepRefs } from './alarmConfigValidation.js';
import type { AlarmRunbookTailConfig } from './AlarmRunbookTailConfig.js';
import type { FinishAlarmRunbookOptions } from './FinishAlarmRunbookOptions.js';

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
 *   builderName: 'createLambdaAlarmRunbook',
 *   defaultFallback: () => defaultLambdaUnknownCaseFallback(ctx.downstreams),
 *   runbookContext: { ...ctx.runbookContext },
 *   primaryResource: config.lambda.name,
 *   anchors: { hooks: ctx.hooks, reached: reachedAnchors, pipelineName: 'Lambda' },
 * });
 * ```
 */
export function finishAlarmRunbook<TAnchor extends string = never>(
  builder: AlarmRunbookBuilder,
  config: AlarmRunbookTailConfig,
  options: FinishAlarmRunbookOptions<TAnchor>,
): Runbook {
  // Checked against what the builder assembled, not against a list each toolkit
  // maintains by hand: three of the five forgot the check entirely, so a case
  // left on a renamed step id built cleanly and could never match again.
  assertKnownCaseStepRefs(
    { builderName: options.builderName, runbookId: config.id },
    config.knownCases,
    builder.wiredStepIds(),
    '. Remove the reference or wire the step.',
  );

  for (const knownCase of config.knownCases) {
    builder.knownCase(knownCase);
  }

  builder.fallback(config.fallbackAction ?? options.defaultFallback());
  builder.runbookContext(options.runbookContext);
  builder.analysisDefaults({
    ...omitUndefined({ runbookName: options.defaultRunbookName }),
    ...config.analysisDefaults,
    resources: [
      { name: options.primaryResource, ...omitUndefined({ type: options.primaryResourceType }), role: 'PRIMARY' },
      ...(config.analysisDefaults?.resources ?? []),
    ],
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
