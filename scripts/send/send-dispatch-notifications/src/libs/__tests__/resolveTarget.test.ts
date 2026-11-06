import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { Dispatch } from '@go-automation/go-send';

import type { DispatchTarget } from '../../types/DispatchTarget.js';
import type { SendDispatchNotificationsConfig } from '../../types/SendDispatchNotificationsConfig.js';
import { DispatchUsageError } from '../DispatchUsageError.js';
import { resolveTarget, usesB2B } from '../resolveTarget.js';
import { validateConfig } from '../validateConfig.js';
import type { FakeLogger } from './helpers/testScript.js';
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
  consolidatore-test:
    mode: direct
    description: Consolidatore TEST
    ecBaseUrl: http://localhost:8888
    sender: { taxId: '00000000001', denomination: Comune di Test }
    defaults:
      direct.aar.key: PN_AAR-1.pdf
    tunnel:
      awsProfile: sso_pn-confinfo-test
      target: i-065a7d9f4a91add01
      remoteHost: internal-EcsA-1.eu-south-1.elb.amazonaws.com
      remotePort: 8080
      localPort: 8888
`;

/** Loader whose only variable is PN_API_KEY_TEST. */
const LOADER = new Dispatch.EnvironmentLoader((name: string) => (name === 'PN_API_KEY_TEST' ? 'key-1234' : undefined));

async function resolveWithLogger(
  overrides: Partial<SendDispatchNotificationsConfig>,
): Promise<{ target: DispatchTarget; logger: FakeLogger }> {
  const { script, dir, logger } = await createTestScript();
  const environmentsFile = path.join(dir, 'environments.yaml');
  await writeFixture(environmentsFile, ENVIRONMENTS);
  const target = await resolveTarget(script, validateConfig({ ...RAW_CONFIG, environmentsFile, ...overrides }), LOADER);
  return { target, logger };
}

async function resolve(overrides: Partial<SendDispatchNotificationsConfig>): Promise<DispatchTarget> {
  return (await resolveWithLogger(overrides)).target;
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

  it('applies the CLI overrides of base path and group', async () => {
    const target = await resolve({ env: 'ente-test', basePath: 'api.uat.example/', groupId: 'g2' });
    assert.equal(target.b2b?.basePath, 'https://api.uat.example');
    assert.equal(target.groupId, 'g2');
  });

  it('takes the API key only from the variable of the environment, ignoring pn.api.key (e.g. PN_API_KEY)', async () => {
    const { target, logger } = await resolveWithLogger({ env: 'ente-test', pnApiKey: 'stale-key-from-PN_API_KEY' });
    assert.equal(target.b2b?.apiKey, 'key-1234', 'the key of $PN_API_KEY_TEST');
    assert.match(target.b2b?.apiKeyLabel ?? '', /^\$PN_API_KEY_TEST /);
    assert.ok(
      logger.of('warning').some((line) => line.includes('pn.api.key ignorata') && line.includes('$PN_API_KEY_TEST')),
    );
  });

  it('does not let pn.api.key stand in for an unset variable of the environment', async () => {
    await assert.rejects(resolve({ env: 'ente-prod', pnApiKey: 'stale-key' }), /PN_API_KEY_PROD is not set/);
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

describe('resolveTarget (direct environments)', () => {
  const directRun: Partial<SendDispatchNotificationsConfig> = {
    mode: 'direct',
    phases: ['send'],
    env: 'consolidatore-test',
    awsProfiles: ['sso_pn-confinfo-test'],
  };

  it('takes pn-external-channels, sender, defaults and tunnel from the environment', async () => {
    const target = await resolve(directRun);
    assert.equal(target.name, 'consolidatore-test');
    assert.deepEqual(target.externalChannels, { baseUrl: 'http://localhost:8888', clientId: 'pn-cons-000' });
    assert.equal(target.sender?.taxId, '00000000001');
    assert.equal(target.defaults.get('direct.aar.key'), 'PN_AAR-1.pdf');
    assert.equal(target.tunnel?.target, 'i-065a7d9f4a91add01');
    assert.equal(target.b2b, undefined);
  });

  it('ignores --ec-base-url (or EC_BASE_URL) with --env, with a warning', async () => {
    const { target, logger } = await resolveWithLogger({ ...directRun, ecBaseUrl: 'http://localhost:9999' });
    assert.equal(target.externalChannels?.baseUrl, 'http://localhost:8888');
    assert.ok(logger.of('warning').some((line) => line.startsWith('--ec-base-url ignorato')));
  });

  it('requires the tunnel profile among --aws-profiles', async () => {
    await assert.rejects(resolve({ ...directRun, awsProfiles: ['sso_other'] }), /add it to --aws-profiles/);
  });

  it('tells which mode an environment belongs to', async () => {
    await assert.rejects(resolve({ ...directRun, env: 'ente-test' }), /is an e2e environment: use --mode e2e/);
    await assert.rejects(resolve({ env: 'consolidatore-test' }), /is a direct environment: use --mode direct/);
  });
});
