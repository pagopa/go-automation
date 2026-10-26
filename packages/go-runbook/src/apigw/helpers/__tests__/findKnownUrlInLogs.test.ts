import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';
import { scanServiceLogs } from '../scanServiceLogs.js';
import { KnownUrlsRegistry } from '../../registries/KnownUrlsRegistry.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';

const SCHEMA = SEND_API_GW_PROFILE.serviceLog.schema;

function row(message: string): ResultField[] {
  return [{ field: '@message', value: message }];
}

describe('scanServiceLogs knownUrl projection', () => {
  const registry = new KnownUrlsRegistry([
    { url: 'https://api.io.pagopa.it/api/v1/activations/', target: 'AppIO' },
    {
      url: 'http://internal-EcsA-123:8080/ext-registry-private/',
      target: 'pn-external-registries',
    },
  ]);

  it('returns the first matching URL across the rows', () => {
    const rows = [
      row('nothing to see here'),
      row('Invoking https://api.io.pagopa.it/api/v1/activations/abc with body=...'),
    ];
    const match = scanServiceLogs(rows, SCHEMA, registry).knownUrl;
    assert.ok(match !== undefined);
    assert.strictEqual(match.known.target, 'AppIO');
    assert.strictEqual(match.observedUrl, 'https://api.io.pagopa.it/api/v1/activations/abc');
  });

  it('prefers ERROR and WARN URLs over INFO invocations regardless of row order', () => {
    const invocation = [
      { field: 'level', value: 'INFO' },
      ...row('Invoking external service https://api.io.pagopa.it/api/v1/activations/abc'),
    ];
    for (const level of ['ERROR', 'WARN']) {
      const failure = [
        { field: 'level', value: level },
        ...row('Request failed to GET http://internal-EcsA-123:8080/ext-registry-private/payments'),
      ];
      for (const rows of [
        [invocation, failure],
        [failure, invocation],
      ]) {
        assert.strictEqual(scanServiceLogs(rows, SCHEMA, registry).knownUrl?.known.target, 'pn-external-registries');
      }
    }
  });

  it('uses failure keywords without a level but prefers an explicit failure level', () => {
    const invocation = [
      { field: 'level', value: 'INFO' },
      ...row('Invoking external service https://api.io.pagopa.it/api/v1/activations/abc'),
    ];
    const implicitFailure = row('Exception calling http://internal-EcsA-123:8080/ext-registry-private/payments');
    assert.strictEqual(
      scanServiceLogs([invocation, implicitFailure], SCHEMA, registry).knownUrl?.known.target,
      'pn-external-registries',
    );
    const explicitFailure = [
      { field: 'level', value: 'WARN' },
      ...row('Request failed to GET https://api.io.pagopa.it/api/v1/activations/abc'),
    ];
    assert.strictEqual(
      scanServiceLogs([implicitFailure, explicitFailure], SCHEMA, registry).knownUrl?.known.target,
      'AppIO',
    );
  });

  it('preserves invocation fallback when failure rows have no known URL', () => {
    const rows = [
      [{ field: 'level', value: 'INFO' }, ...row('Invoking https://api.io.pagopa.it/api/v1/activations/abc')],
      [{ field: 'level', value: 'ERROR' }, ...row('Exception calling http://unknown.example/path')],
    ];
    assert.strictEqual(scanServiceLogs(rows, SCHEMA, registry).knownUrl?.known.target, 'AppIO');
  });

  it('keeps the first known URL among rows with equal failure priority', () => {
    const rows = [
      [{ field: 'level', value: 'WARN' }, ...row('Request failed https://api.io.pagopa.it/api/v1/activations/abc')],
      [
        { field: 'level', value: 'ERROR' },
        ...row('Request failed http://internal-EcsA-123:8080/ext-registry-private/payments'),
      ],
    ];
    assert.strictEqual(scanServiceLogs(rows, SCHEMA, registry).knownUrl?.known.target, 'AppIO');
  });

  it('trims trailing punctuation before probing the registry', () => {
    const match = scanServiceLogs(
      [row('called http://internal-EcsA-123:8080/ext-registry-private/io/v1/activations.')],
      SCHEMA,
      registry,
    ).knownUrl;
    assert.ok(match !== undefined);
    assert.strictEqual(match.known.target, 'pn-external-registries');
    assert.ok(!match.observedUrl.endsWith('.'));
  });

  it('returns undefined when no URL matches', () => {
    const match = scanServiceLogs([row('http://unknown.example/path')], SCHEMA, registry).knownUrl;
    assert.strictEqual(match, undefined);
  });

  it('skips rows with no message field', () => {
    const match = scanServiceLogs(
      [[{ field: 'other', value: 'no message here' }], row('https://api.io.pagopa.it/api/v1/activations/x')],
      SCHEMA,
      registry,
    ).knownUrl;
    assert.ok(match !== undefined);
  });

  it('honours declaration order on overlapping prefixes', () => {
    const broad = new KnownUrlsRegistry([
      { url: 'https://api.io.pagopa.it/api/', target: 'AppIO-broad' },
      { url: 'https://api.io.pagopa.it/api/v1/', target: 'AppIO-v1' },
    ]);
    const match = scanServiceLogs([row('https://api.io.pagopa.it/api/v1/activations/x')], SCHEMA, broad).knownUrl;
    assert.strictEqual(match?.known.target, 'AppIO-broad');
  });
});
