import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOConfigParameterOptions } from '../../config/GOConfigParameter.js';
import { GOConfigParameterType } from '../../config/GOConfigParameterType.js';
import { GOScript } from '../GOScript.js';
import type { GOScriptLifecycleHook } from '../GOScriptOptions.js';

/** A quiet script declaring `parameters`, whose prepare phase is `onAfterConfigLoad`. */
function scriptWith(parameters: GOConfigParameterOptions[], onAfterConfigLoad: GOScriptLifecycleHook): GOScript {
  return new GOScript({
    metadata: { name: 'prepare phase', version: '1.0.0', description: 'prepare', authors: ['test'] },
    config: { parameters },
    logging: { console: false, file: false },
    hooks: { onAfterConfigLoad },
  });
}

function stringParameter(name: string, extra: Partial<GOConfigParameterOptions> = {}): GOConfigParameterOptions {
  return { name, type: GOConfigParameterType.STRING, description: name, required: false, ...extra };
}

describe('GOScript onAfterConfigLoad as prepare phase', () => {
  it('derives/overrides a config value via context.config (visible to getConfiguration)', async () => {
    const script = scriptWith(
      [stringParameter('base.value', { defaultValue: 'hello' }), stringParameter('derived.value')],
      (ctx) => {
        const base = ctx.config.getString('base.value');
        if (base !== undefined && !ctx.config.has('derived.value')) {
          ctx.config.set('derived.value', `${base}-derived`);
        }
      },
    );

    const cfg = await script.getConfiguration<{ baseValue?: string; derivedValue?: string }>();
    assert.strictEqual(cfg.derivedValue, 'hello-derived');
  });

  it('lets a value set in onAfterConfigLoad satisfy a required parameter (runs before validation)', async () => {
    const script = scriptWith([stringParameter('must.have', { required: true })], (ctx) => {
      ctx.config.set('must.have', 'filled-by-prepare');
    });

    const cfg = await script.getConfiguration<{ mustHave?: string }>();
    assert.strictEqual(cfg.mustHave, 'filled-by-prepare');
  });

  it('re-validates required parameters against the post-prepare config (a hook clearing a required value is caught)', async () => {
    const script = scriptWith(
      [stringParameter('must.have', { required: true, defaultValue: 'provided-at-load' })],
      (ctx) => {
        ctx.config.set('must.have', undefined);
      },
    );

    await assert.rejects(script.loadConfig());
  });

  it('reads environment variables through context.env', async (t) => {
    const previous = process.env['GO_HOOK_ENV_PROBE'];
    t.after(() => {
      if (previous === undefined) delete process.env['GO_HOOK_ENV_PROBE'];
      else process.env['GO_HOOK_ENV_PROBE'] = previous;
    });
    process.env['GO_HOOK_ENV_PROBE'] = 'from-env';
    let value: string | undefined;
    const script = scriptWith([], (ctx) => {
      value = ctx.env.get('GO_HOOK_ENV_PROBE');
    });

    await script.loadConfig();

    assert.strictEqual(value, 'from-env');
  });
});
