import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOConfigKeyTransformer } from '../GOConfigKeyTransformer.js';

describe('GOConfigKeyTransformer', () => {
  it('converts hierarchical keys to environment variable names', () => {
    assert.strictEqual(GOConfigKeyTransformer.toEnvironmentKey('http.serverTimeout'), 'HTTP_SERVER_TIMEOUT');
    assert.strictEqual(GOConfigKeyTransformer.toEnvironmentKey('api.v2.endpoint'), 'API_V2_ENDPOINT');
    assert.strictEqual(GOConfigKeyTransformer.toEnvironmentKey('aws.HTTPSClient'), 'AWS_HTTPS_CLIENT');
  });

  it('converts hierarchical keys to CLI flags', () => {
    assert.strictEqual(GOConfigKeyTransformer.toCLIFlag('http.serverTimeout'), '--http-server-timeout');
    assert.strictEqual(GOConfigKeyTransformer.toCLIFlag('api.v2.endpoint'), '--api-v2-endpoint');
  });

  it('normalizes environment, CLI and camelCase keys to the same dotted form', () => {
    assert.strictEqual(GOConfigKeyTransformer.normalize('HTTP_SERVER_TIMEOUT'), 'http.server.timeout');
    assert.strictEqual(GOConfigKeyTransformer.normalize('--http-server-timeout'), 'http.server.timeout');
    assert.strictEqual(GOConfigKeyTransformer.normalize('-http-server-timeout'), 'http.server.timeout');
    assert.strictEqual(GOConfigKeyTransformer.normalize('httpServerTimeout'), 'http.server.timeout');
  });

  it('matches normalized keys against environment names and CLI flags', () => {
    assert.strictEqual(GOConfigKeyTransformer.matchesEnvironmentKey('http.timeout', 'HTTP_TIMEOUT'), true);
    assert.strictEqual(GOConfigKeyTransformer.matchesEnvironmentKey('http.timeout', 'HTTP_TIME_OUT'), false);
    assert.strictEqual(GOConfigKeyTransformer.matchesCLIFlag('http.timeout', '--http-timeout'), true);
    assert.strictEqual(GOConfigKeyTransformer.matchesCLIFlag('http.timeout', '--http.timeout'), false);
  });

  it('converts environment names and CLI flags back to dotted keys', () => {
    assert.strictEqual(GOConfigKeyTransformer.fromEnvironmentKey('HTTP_SERVER_TIMEOUT'), 'http.server.timeout');
    assert.strictEqual(GOConfigKeyTransformer.fromCLIFlag('--http-server-timeout'), 'http.server.timeout');
    assert.strictEqual(GOConfigKeyTransformer.fromCLIFlag('-v'), 'v');
  });
});
