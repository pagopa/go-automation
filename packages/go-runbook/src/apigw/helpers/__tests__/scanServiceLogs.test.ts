import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';
import { scanServiceLogs } from '../scanServiceLogs.js';
import { KnownUrlsRegistry } from '../../registries/KnownUrlsRegistry.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';

const SCHEMA = SEND_API_GW_PROFILE.serviceLog.schema;

function row(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

describe('scanServiceLogs', () => {
  it('derives error message, known URL, fallback UUID and trace id in a single pass', () => {
    const registry = new KnownUrlsRegistry([{ url: 'https://api.io.pagopa.it/api/v1/activations/', target: 'AppIO' }]);
    const rows: ReadonlyArray<ResultField[]> = [
      row({
        level: 'ERROR',
        '@message':
          'Exception calling https://api.io.pagopa.it/api/v1/activations/123 ' +
          '"traceId":"FALLBACK-UUID:2ae8a94e-50fc-445a-b9e2-989637cc129f"',
        trace_id: '3d472be72977635208a92722b97b5e24',
      }),
    ];

    const scan = scanServiceLogs(rows, SCHEMA, registry);

    assert.match(scan.errorMessage, /Exception calling/);
    assert.strictEqual(scan.knownUrl?.known.target, 'AppIO');
    assert.strictEqual(scan.fallbackUuid, '2ae8a94e-50fc-445a-b9e2-989637cc129f');
    assert.deepStrictEqual(scan.traceIdCandidate, {
      raw: '3d472be72977635208a92722b97b5e24',
      canonical: '1-3d472be7-2977635208a92722b97b5e24',
    });
  });

  it('leaves knownUrl undefined when no registry is supplied', () => {
    const rows: ReadonlyArray<ResultField[]> = [
      row({ '@message': 'see https://api.io.pagopa.it/api/v1/activations/9' }),
    ];

    const scan = scanServiceLogs(rows, SCHEMA);

    assert.strictEqual(scan.knownUrl, undefined);
  });

  it('falls back to the keyword heuristic when no row carries an ERROR level', () => {
    const rows: ReadonlyArray<ResultField[]> = [
      row({ level: 'DEBUG', '@message': 'failedAttempts=0 retry scheduled' }),
      row({ '@message': 'REPORT Duration: 5000 ms Status: timeout' }),
    ];

    const scan = scanServiceLogs(rows, SCHEMA);

    // The DEBUG row is excluded; the level-less REPORT row matches a keyword.
    assert.match(scan.errorMessage, /Status: timeout/);
  });

  it('returns empty / undefined projections for an empty result set', () => {
    const scan = scanServiceLogs([], SCHEMA);

    assert.strictEqual(scan.errorMessage, '');
    assert.strictEqual(scan.knownUrl, undefined);
    assert.strictEqual(scan.fallbackUuid, undefined);
    assert.strictEqual(scan.traceIdCandidate, undefined);
  });
});
