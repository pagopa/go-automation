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
  it('splices only the hooks registered at the anchor, in declaration order', () => {
    const builder = builderUnderTest();
    const hooks = [hook('a', 'first'), hook('b', 'second'), hook('c', 'first')];
    const reached = new Set<Anchor>();

    applyPipelineHooks(builder, hooks, 'first', reached);

    assert.deepStrictEqual(
      builder.build().steps.map((descriptor) => descriptor.step.id),
      ['a', 'c'],
    );
  });

  it('carries the descriptor options through', () => {
    const builder = builderUnderTest();

    applyPipelineHooks(
      builder,
      [hook('a', 'first', { continueOnFailure: true, silent: true })],
      'first',
      new Set<Anchor>(),
    );

    const descriptor = builder.build().steps[0];
    assert.strictEqual(descriptor?.continueOnFailure, true);
    assert.strictEqual(descriptor?.silent, true);
  });

  it('records the anchor even when no hook targets it', () => {
    const reached = new Set<Anchor>();
    const builder = builderUnderTest();

    applyPipelineHooks(builder, [], 'second', reached);

    assert.deepStrictEqual([...reached], ['second']);
  });
});

describe('orphanHookAnchors', () => {
  it('reports an anchor the pipeline never emitted', () => {
    // Without this a hook on a removed or misspelled anchor would silently
    // vanish instead of failing the build.
    const orphans = orphanHookAnchors([hook('a', 'first'), hook('b', 'never-reached')], new Set<Anchor>(['first']));

    assert.deepStrictEqual(orphans, ['never-reached']);
  });

  it('reports each orphan anchor once', () => {
    const orphans = orphanHookAnchors(
      [hook('a', 'never-reached'), hook('b', 'never-reached')],
      new Set<Anchor>(['first']),
    );

    assert.deepStrictEqual(orphans, ['never-reached']);
  });

  it('is empty when every hook was spliced', () => {
    assert.deepStrictEqual(orphanHookAnchors([hook('a', 'first')], new Set<Anchor>(['first', 'second'])), []);
  });
});
