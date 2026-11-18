import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PipelineHook } from '../../types/PipelineHook.js';
import type { Step } from '../../types/Step.js';
import { RunbookBuilder } from '../RunbookBuilder.js';
import { applyPipelineHooks, orphanHookAnchors } from '../applyPipelineHooks.js';

type Anchor = 'first' | 'second' | 'never-reached';

function fakeStep(id: string): Step {
  return {
    id,
    label: id,
    kind: 'data',
    // eslint-disable-next-line @typescript-eslint/require-await
    execute: async () => ({ success: true as const }),
  };
}

function hook(id: string, at: Anchor, extra: Partial<PipelineHook<Anchor>> = {}): PipelineHook<Anchor> {
  return { at, step: fakeStep(id), ...extra };
}

/** Smallest builder `build()` accepts: it validates metadata and a fallback. */
function builderUnderTest(): RunbookBuilder {
  return RunbookBuilder.create('r')
    .metadata({ name: 'r', description: '', version: '1.0.0', type: 'alarm-resolution', team: 'GO', tags: [] })
    .fallback({ type: 'log', level: 'warn', title: 'nessun caso' });
}

describe('applyPipelineHooks', () => {
  it('splices only the hooks of the anchor, in declaration order, with their options', () => {
    const builder = builderUnderTest();
    const reached = new Set<Anchor>();

    applyPipelineHooks(
      builder,
      [hook('a', 'first', { continueOnFailure: true, silent: true }), hook('b', 'second'), hook('c', 'first')],
      'first',
      reached,
    );

    const steps = builder.build().steps;
    assert.deepStrictEqual(
      steps.map((descriptor) => descriptor.step.id),
      ['a', 'c'],
    );
    assert.deepStrictEqual([steps[0]?.continueOnFailure, steps[0]?.silent], [true, true]);
    assert.deepStrictEqual([...reached], ['first']);
  });

  it('records the anchor even when no hook targets it', () => {
    const reached = new Set<Anchor>();

    applyPipelineHooks(builderUnderTest(), [], 'second', reached);

    assert.deepStrictEqual([...reached], ['second']);
  });
});

describe('orphanHookAnchors', () => {
  it('reports, once each, the anchors the pipeline never emitted', () => {
    // Without this a hook on a removed or misspelled anchor would silently
    // vanish instead of failing the build.
    const reached = new Set<Anchor>(['first']);
    assert.deepStrictEqual(
      orphanHookAnchors([hook('a', 'first'), hook('b', 'never-reached'), hook('c', 'never-reached')], reached),
      ['never-reached'],
    );
    assert.deepStrictEqual(orphanHookAnchors([hook('a', 'first')], reached), []);
  });
});
