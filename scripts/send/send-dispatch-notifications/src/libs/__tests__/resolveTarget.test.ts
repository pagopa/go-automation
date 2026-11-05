import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { Dispatch } from '@go-automation/go-send';

import type { DispatchTarget } from '../../types/DispatchTarget.js';
import type { SendDispatchNotificationsConfig } from '../../types/SendDispatchNotificationsConfig.js';
import { DispatchUsageError } from '../DispatchUsageError.js';
import { resolveTarget, usesB2B } from '../resolveTarget.js';
import { validateConfig } from '../validateConfig.js';
import { RAW_CONFIG, createTestScript, writeFixture } from './helpers/testScript.js';

const ENVIRONMENTS = `environments:
  ente-test:
    basePath: api.test.example
    apiKey: \${PN_API_KEY_TEST}
    groupId: 'group-1'
    awsProfile: sso_test
    production: false
    sender: { taxId: '00000000001', denomination: Comune di Test }
  ente-prod:
    basePath: api.prod.example
    apiKey: \${PN_API_KEY_PROD}
    production: true
`;

/** Loader whose only variable is PN_API_KEY_TEST. */
const LOADER = new Dispatch.EnvironmentLoader((name: string) => (name === 'PN_API_KEY_TEST' ? 'key-1234' : undefined));

async function resolve(overrides: Partial<SendDispatchNotificationsConfig>): Promise<DispatchTarget> {
  const { script, dir } = await createTestScript();
  const environmentsFile = path.join(dir, 'environments.yaml');
  await writeFixture(environmentsFile, ENVIRONMENTS);
  return resolveTarget(script, validateConfig({ ...RAW_CONFIG, environmentsFile, ...overrides }), LOADER);
}

describe('resolveTarget', () => {
  it('resolves an environment with its API key when the run calls the B2B API', async () => {
    const target = await resolve({ env: 'ente-test' });
    assert.equal(target.name, 'ente-test');
    assert.equal(target.b2b?.basePath, 'https://api.test.example');
    assert.equal(target.b2b?.apiKey, 'key-1234');
    assert.match(target.b2b?.apiKeyLabel ?? '', /^\$PN_API_KEY_TEST /);
    assert.equal(target.groupId, 'group-1');
    assert.equal(target.awsProfile, 'sso_test');
  });

  it('applies the CLI overrides', async () => {
    const target = await resolve({
      env: 'ente-test',
      basePath: 'api.uat.example/',
      pnApiKey: 'override-9876',
      groupId: 'g2',
    });
    assert.equal(target.b2b?.basePath, 'https://api.uat.example');
    assert.equal(target.b2b?.apiKey, 'override-9876');
    assert.match(target.b2b?.apiKeyLabel ?? '', /^--pn-api-key /);
    assert.equal(target.groupId, 'g2');
  });

  it('accepts --pn-api-key when the variable of the environment is not set', async () => {
    const target = await resolve({ env: 'ente-prod', pnApiKey: 'override-9876' }); // PN_API_KEY_PROD unset
    assert.equal(target.b2b?.basePath, 'https://api.prod.example');
    assert.equal(target.b2b?.apiKey, 'override-9876');
    assert.match(target.b2b?.apiKeyLabel ?? '', /^--pn-api-key /);
  });

  it('needs neither API key nor base path with only the request-id phase', async () => {
    assert.equal(usesB2B(validateConfig({ ...RAW_CONFIG, phases: ['request-id'] })), false);
    const fromEnv = await resolve({ env: 'ente-prod', phases: ['request-id'] });
    assert.equal(fromEnv.b2b, undefined, 'PN_API_KEY_PROD is not set and not needed');
    assert.equal(fromEnv.production, true);
    const adHoc = await resolve({ phases: ['request-id'] });
    assert.equal(adHoc.name, 'ad-hoc');
    assert.equal(adHoc.b2b, undefined);
  });

  it('reports missing environments, variables and ad-hoc parameters as usage errors', async () => {
    await assert.rejects(resolve({ env: 'ente-x' }), /not found .*available: ente-test, ente-prod/);
    await assert.rejects(resolve({ env: 'ente-prod' }), (error: unknown) => {
      assert.ok(error instanceof DispatchUsageError);
      assert.match(error.message, /PN_API_KEY_PROD is not set/);
      return true;
    });
    await assert.rejects(resolve({}), /--base-path and --pn-api-key/);
    await assert.rejects(resolve({ basePath: 'http://exa mple', pnApiKey: 'k' }), DispatchUsageError);
  });

  it('builds the direct target, production only with --ec-production', async () => {
    const direct = { mode: 'direct', phases: ['send'], ecBaseUrl: 'http://localhost:8888' };
    const test = await resolve(direct);
    assert.equal(test.name, 'direct');
    assert.deepEqual(test.externalChannels, { baseUrl: 'http://localhost:8888', clientId: 'pn-cons-000' });
    assert.equal(test.b2b, undefined);
    assert.equal(test.production, false);
    assert.equal((await resolve({ ...direct, ecProduction: true })).production, true);
  });
});
