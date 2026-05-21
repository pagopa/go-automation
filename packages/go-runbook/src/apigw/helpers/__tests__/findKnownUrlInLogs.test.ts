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
