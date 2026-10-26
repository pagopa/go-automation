import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { WATCHTOWER_PRODUCTION_BASE_URL } from '../external.js';
import { validateWatchtowerBaseUrl, waitForWatchtowerDeploymentStatus } from '../watchtower.js';

const INPUT = {
  baseUrl: WATCHTOWER_PRODUCTION_BASE_URL,
  secretArn: 'arn:aws:secretsmanager:eu-south-1:123456789012:secret:worker',
  region: 'eu-south-1',
  catalogRevision: 'revision-test',
  runbookKeys: ['runbook-test'],
  timeoutMs: 1000,
  requireDrained: true,
};

afterEach(() => mock.restoreAll());

describe('trusted Watchtower endpoint', () => {
  it('accepts the known production endpoint and normalizes API suffixes and trailing slashes', () => {
    assert.equal(validateWatchtowerBaseUrl(WATCHTOWER_PRODUCTION_BASE_URL), WATCHTOWER_PRODUCTION_BASE_URL);
    assert.equal(validateWatchtowerBaseUrl(`${WATCHTOWER_PRODUCTION_BASE_URL}/api///`), WATCHTOWER_PRODUCTION_BASE_URL);
  });

  for (const url of [
    'https://attacker.example/bff',
    'https://d2xwbj6sp8axq2.cloudfront.net.attacker.example/bff',
    'https://d2xwbj6sp8axq2.cloudfront.net:8443/bff',
    `${WATCHTOWER_PRODUCTION_BASE_URL}/other`,
    'http://d2xwbj6sp8axq2.cloudfront.net/bff',
    'https://d2xwbj6sp8axq2.cloudfront.net@attacker.example/bff',
    'https://user:password@d2xwbj6sp8axq2.cloudfront.net/bff',
    `${WATCHTOWER_PRODUCTION_BASE_URL}?redirect=attacker`,
    `${WATCHTOWER_PRODUCTION_BASE_URL}#fragment`,
    `${WATCHTOWER_PRODUCTION_BASE_URL}?`,
    `${WATCHTOWER_PRODUCTION_BASE_URL}#`,
    '/relative/path',
  ]) {
    it(`rejects an untrusted or malformed configured destination: ${url}`, () => {
      assert.throws(() => validateWatchtowerBaseUrl(url), /Watchtower|WATCHTOWER_INTERNAL_URL/);
    });
  }

  it('requires an independent explicit override for a different backend', () => {
    const custom = 'https://watchtower.example.test/bff';
    assert.throws(() => validateWatchtowerBaseUrl(custom), /does not match/);
    assert.equal(validateWatchtowerBaseUrl(`${custom}/api/`, custom), custom);
    assert.throws(() => validateWatchtowerBaseUrl('https://attacker.example', custom), /does not match/);
    assert.throws(
      () => validateWatchtowerBaseUrl('http://watchtower.example.test', 'http://watchtower.example.test'),
      /HTTPS/,
    );
  });

  it('rejects an untrusted destination before reading secrets or sending requests', async () => {
    const secret = mock.method(SecretsManagerClient.prototype, 'send', async () => {
      await Promise.resolve();
      assert.fail('Must not retrieve secrets for an untrusted destination');
    });
    const request = mock.method(globalThis, 'fetch', async () => {
      await Promise.resolve();
      assert.fail('Must not send requests to an untrusted destination');
    });
    await assert.rejects(
      waitForWatchtowerDeploymentStatus({ ...INPUT, baseUrl: 'https://attacker.example' }),
      /does not match/,
    );
    assert.equal(secret.mock.callCount(), 0);
    assert.equal(request.mock.callCount(), 0);
  });
});

describe('Watchtower deployment requests', () => {
  for (const trustedBaseUrl of [undefined, 'https://watchtower.example.test/bff']) {
    it(`pins both authenticated requests to ${trustedBaseUrl ?? 'the production default'} and blocks redirects`, async () => {
      mock.method(SecretsManagerClient.prototype, 'send', async () => {
        await Promise.resolve();
        return { SecretString: 'test-service-password', $metadata: {} };
      });
      const expected = trustedBaseUrl ?? WATCHTOWER_PRODUCTION_BASE_URL;
      const request = mock.method(globalThis, 'fetch', async (input: string | URL | Request, options?: RequestInit) => {
        await Promise.resolve();
        assert.equal(options?.redirect, 'error');
        assert.ok(typeof input === 'string');
        if (input === `${expected}/auth/service/login`) {
          assert.equal(options?.method, 'POST');
          assert.ok(typeof options.body === 'string');
          assert.deepEqual(JSON.parse(options.body), {
            serviceId: 'runbook-automation-worker',
            password: 'test-service-password',
          });
          return Response.json({ accessToken: 'test-access-token' });
        }
        const url = new URL(input);
        assert.equal(`${url.origin}${url.pathname}`, `${expected}/api/internal/automatic-runbooks/deployment-status`);
        assert.equal(url.searchParams.get('catalogRevision'), 'revision-test');
        assert.equal(url.searchParams.get('runbookKeys'), 'runbook-test');
        assert.deepEqual(options?.headers, { authorization: 'Bearer test-access-token', accept: 'application/json' });
        return Response.json({ catalogRevisionObserved: true, inFlightExecutions: 0, byStatus: {} });
      });
      await waitForWatchtowerDeploymentStatus({
        ...INPUT,
        baseUrl: `${expected}/api/`,
        ...(trustedBaseUrl === undefined ? {} : { trustedBaseUrl }),
      });
      assert.equal(request.mock.callCount(), 2);
    });
  }

  it('does not follow a login redirect or issue an authenticated polling request', async () => {
    mock.method(SecretsManagerClient.prototype, 'send', async () => {
      await Promise.resolve();
      return { SecretString: 'test-service-password', $metadata: {} };
    });
    const request = mock.method(globalThis, 'fetch', async (_input: string | URL | Request, options?: RequestInit) => {
      await Promise.resolve();
      assert.equal(options?.redirect, 'error');
      return new Response(null, { status: 307, headers: { location: 'https://attacker.example' } });
    });
    await assert.rejects(waitForWatchtowerDeploymentStatus(INPUT), /returned 307/);
    assert.equal(request.mock.callCount(), 1);
  });

  it('does not follow a redirect from the authenticated status endpoint', async () => {
    mock.method(SecretsManagerClient.prototype, 'send', async () => {
      await Promise.resolve();
      return { SecretString: 'test-service-password', $metadata: {} };
    });
    const request = mock.method(globalThis, 'fetch', async (input: string | URL | Request, options?: RequestInit) => {
      await Promise.resolve();
      assert.equal(options?.redirect, 'error');
      assert.ok(typeof input === 'string');
      if (input.endsWith('/auth/service/login')) return Response.json({ accessToken: 'test-access-token' });
      return new Response(null, { status: 307, headers: { location: 'https://attacker.example' } });
    });
    await assert.rejects(waitForWatchtowerDeploymentStatus(INPUT), /status returned 307/);
    assert.equal(request.mock.callCount(), 2);
  });
});
