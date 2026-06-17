import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOConfigParameterType } from '../../config/GOConfigParameterType.js';
import { GOScript } from '../GOScript.js';

describe('GOScript onAfterConfigLoad as prepare phase', () => {
  it('derives/overrides a config value via context.config (visible to getConfiguration)', async () => {
    const script = new GOScript({
      metadata: { name: 'prepare derive', version: '1.0.0', description: 'derive', authors: ['test'] },
      config: {
        parameters: [
          {
            name: 'base.value',
            type: GOConfigParameterType.STRING,
            description: 'base',
            required: false,
            defaultValue: 'hello',
          },
          { name: 'derived.value', type: GOConfigParameterType.STRING, description: 'derived', required: false },
        ],
      },
      logging: { console: false, file: false },
      hooks: {
        onAfterConfigLoad: (ctx) => {
          const base = ctx.config.getString('base.value');
          if (base !== undefined && !ctx.config.has('derived.value')) {
            ctx.config.set('derived.value', `${base}-derived`);
          }
        },
      },
    });

    const cfg = await script.getConfiguration<{ baseValue?: string; derivedValue?: string }>();
    assert.strictEqual(cfg.derivedValue, 'hello-derived');
  });

  it('lets a value set in onAfterConfigLoad satisfy a required parameter (runs before validation)', async () => {
    const script = new GOScript({
      metadata: { name: 'prepare required', version: '1.0.0', description: 'required', authors: ['test'] },
      config: {
        parameters: [
          { name: 'must.have', type: GOConfigParameterType.STRING, description: 'required', required: true },
        ],
      },
      logging: { console: false, file: false },
      hooks: {
        onAfterConfigLoad: (ctx) => {
          ctx.config.set('must.have', 'filled-by-prepare');
        },
      },
    });

    const cfg = await script.getConfiguration<{ mustHave?: string }>();
    assert.strictEqual(cfg.mustHave, 'filled-by-prepare');
  });

  it('exposes config, env, paths, environment and logger on the hook context', async () => {
    let seen:
      | { hasConfig: boolean; hasEnv: boolean; hasPaths: boolean; hasEnvironment: boolean; hasLogger: boolean }
      | undefined;
    const script = new GOScript({
      metadata: { name: 'prepare ctx', version: '1.0.0', description: 'ctx', authors: ['test'] },
      config: { parameters: [] },
      logging: { console: false, file: false },
      hooks: {
        onAfterConfigLoad: (ctx) => {
          seen = {
            hasConfig: typeof ctx.config?.get === 'function',
            hasEnv: typeof ctx.env?.get === 'function',
            hasPaths: typeof ctx.paths?.resolvePath === 'function',
            hasEnvironment: typeof ctx.environment?.isAWSManaged === 'boolean',
            hasLogger: typeof ctx.logger?.info === 'function',
          };
        },
      },
    });

    await script.loadConfig();
    assert.deepStrictEqual(seen, {
      hasConfig: true,
      hasEnv: true,
      hasPaths: true,
      hasEnvironment: true,
      hasLogger: true,
    });
  });

  it('reads environment variables through context.env', async () => {
    const previous = process.env['GO_HOOK_ENV_PROBE'];
    process.env['GO_HOOK_ENV_PROBE'] = 'from-env';
    try {
      let value: string | undefined;
      const script = new GOScript({
        metadata: { name: 'env probe', version: '1.0.0', description: 'env', authors: ['test'] },
        config: { parameters: [] },
        logging: { console: false, file: false },
        hooks: {
          onAfterConfigLoad: (ctx) => {
            value = ctx.env.get('GO_HOOK_ENV_PROBE');
          },
        },
      });
      await script.loadConfig();
      assert.strictEqual(value, 'from-env');
    } finally {
      if (previous === undefined) {
        delete process.env['GO_HOOK_ENV_PROBE'];
      } else {
        process.env['GO_HOOK_ENV_PROBE'] = previous;
      }
    }
  });
});
