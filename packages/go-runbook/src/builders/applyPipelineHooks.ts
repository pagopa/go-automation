import type { PipelineHook } from '../types/PipelineHook.js';
import type { RunbookBuilder } from './RunbookBuilder.js';

/**
 * Appends every hook registered at `anchor`, in declaration order.
 *
 * Records the anchor as reached so {@link assertNoOrphanHooks} can tell a hook
 * that was never spliced from one that simply had nothing to do.
 *
 * @param builder - Builder assembling the canonical pipeline
 * @param hooks - Hooks declared by the runbook
 * @param anchor - Point the builder has just reached
 * @param reached - Set of anchors emitted so far, updated in place
 */
export function applyPipelineHooks<TAnchor extends string>(
  builder: RunbookBuilder,
  hooks: ReadonlyArray<PipelineHook<TAnchor>>,
  anchor: TAnchor,
  reached: Set<TAnchor>,
): void {
  reached.add(anchor);
  for (const hook of hooks) {
    if (hook.at !== anchor) {
      continue;
    }
    const options: { continueOnFailure?: boolean; silent?: boolean } = {};
    if (hook.continueOnFailure === true) options.continueOnFailure = true;
    if (hook.silent === true) options.silent = true;
    builder.step(hook.step, options);
  }
}

/**
 * Fails when a hook targets an anchor the builder never emitted.
 *
 * Without this a typo in `at`, or an anchor removed from the pipeline, would
 * silently drop the step instead of failing the build.
 *
 * @param hooks - Hooks declared by the runbook
 * @param reached - Anchors the builder emitted
 * @returns The anchors that were never reached, empty when everything wired
 */
export function orphanHookAnchors<TAnchor extends string>(
  hooks: ReadonlyArray<PipelineHook<TAnchor>>,
  reached: ReadonlySet<TAnchor>,
): ReadonlyArray<TAnchor> {
  return [...new Set(hooks.filter((hook) => !reached.has(hook.at)).map((hook) => hook.at))];
}
