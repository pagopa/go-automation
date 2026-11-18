import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { scanServiceLogs } from '../scanServiceLogs.js';
import { KnownUrlsRegistry } from '../../../../../common/parsing/knownUrls/KnownUrlsRegistry.js';
import { transformRawTraceId } from '../../../../../common/parsing/traceIds/transformRawTraceId.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const SCHEMA = SEND_API_GW_PROFILE.serviceLog.schema;
const RAW_TRACE = '3d472be72977635208a92722b97b5e24';
const CANONICAL_TRACE = '1-3d472be7-2977635208a92722b97b5e24';
const FIRST_UUID = '11111111-1111-1111-1111-111111111111';
const SECOND_UUID = '22222222-2222-2222-2222-222222222222';

/** A service log row: the message, with the level only when it is not empty. */
function row(level: string, message: string, field: string = 'message'): GOLogsInsightsResultField[] {
  return logRow(level === '' ? { [field]: message } : { level, [field]: message });
}

describe('scanServiceLogs errorMessage', () => {
  const cases: ReadonlyArray<readonly [string, ReadonlyArray<GOLogsInsightsResultField[]>, string | RegExp]> = [
    ['no rows', [], ''],
    [
      'the longest ERROR/WARN row over any longer row of another level',
      [row('ERROR', 'short err'), row('DEBUG', 'a'.repeat(500)), row('WARN', 'b'.repeat(200))],
      'b'.repeat(200),
    ],
    [
      'a real error over a DEBUG row containing "failed"',
      [
        row('DEBUG', 'Delete data in DynamoDb table: pn-UserAttributes, key: VerificationCodeEntity(failedAttempts=0)'),
        row(
          'ERROR',
          '[AUD_AB_DA_IO_INSUP] FAILURE - failed saving exception=io.netty.handler.timeout.ReadTimeoutException',
        ),
      ],
      /AUD_AB_DA_IO_INSUP.*ReadTimeoutException/,
    ],
    [
      'a keyword match when no row carries a level',
      [row('', 'something noisy'), row('', 'NullPointerException at ...')],
      'NullPointerException at ...',
    ],
    [
      'a keyword match only on rows without a non-error level',
      [
        row('DEBUG', 'something failed during retry'),
        row('INFO', 'Exception raised'),
        row('', 'failed to acquire lock'),
      ],
      'failed to acquire lock',
    ],
    ['nothing when no row qualifies', [row('DEBUG', 'all good'), row('INFO', 'still good')], ''],
    [
      'a Lambda REPORT line with Status: timeout',
      [row('', 'REPORT RequestId: 55fc51d5\tDuration: 5000.00 ms\tMax Memory Used: 109 MB\tStatus: timeout')],
      /Duration: 5000\.00 ms.*Status: timeout/,
    ],
    [
      'a Lambda REPORT line with Status: error',
      [row('', 'REPORT RequestId: abc Status: error')],
      'REPORT RequestId: abc Status: error',
    ],
  ];

  it('picks the most representative error message', () => {
    for (const [name, rows, expected] of cases) {
      const message = scanServiceLogs(rows, SCHEMA).errorMessage;
      if (typeof expected === 'string') assert.strictEqual(message, expected, name);
      else assert.match(message, expected, name);
    }
  });
});

describe('scanServiceLogs fallbackUuid', () => {
  const cases: ReadonlyArray<readonly [string, ReadonlyArray<GOLogsInsightsResultField[]>, string | undefined]> = [
    [
      'the canonical FALLBACK-UUID:<uuid> form',
      [row('', `error ... "traceId":"FALLBACK-UUID:${FIRST_UUID}" ...`)],
      FIRST_UUID,
    ],
    [
      'the first match across the rows',
      [row('', 'no uuid'), row('', `FALLBACK-UUID:${FIRST_UUID}`), row('', `FALLBACK-UUID:${SECOND_UUID}`)],
      FIRST_UUID,
    ],
    ['@message when message is absent', [row('', `FALLBACK-UUID:${SECOND_UUID}`, '@message')], SECOND_UUID],
    ['no token', [row('', 'plain log line')], undefined],
    ['tokens that are not UUIDs', [row('', 'FALLBACK-UUID:not-a-uuid'), row('', 'FALLBACK-UUID:12345')], undefined],
    ['an X-Ray trace id', [row('', 'AWS-XRAY-TRACE-ID: 1-68ed8e4c-7eca209c6633327075752c8f')], undefined],
  ];

  it('extracts the fallback UUID', () => {
    for (const [name, rows, expected] of cases) {
      assert.strictEqual(scanServiceLogs(rows, SCHEMA).fallbackUuid, expected, name);
    }
  });
});

const APP_IO = 'https://api.io.pagopa.it/api/v1/activations/abc';
const REGISTRIES = 'http://internal-EcsA-123:8080/ext-registry-private/payments';

describe('scanServiceLogs knownUrl', () => {
  const registry = new KnownUrlsRegistry([
    { url: 'https://api.io.pagopa.it/api/v1/activations/', target: 'AppIO' },
    { url: 'http://internal-EcsA-123:8080/ext-registry-private/', target: 'pn-external-registries' },
  ]);
  const invocation = row('INFO', `Invoking external service ${APP_IO}`, '@message');

  function targetOf(rows: ReadonlyArray<GOLogsInsightsResultField[]>, urls = registry): string | undefined {
    return scanServiceLogs(rows, SCHEMA, urls).knownUrl?.known.target;
  }

  it('returns the first matching URL with the observed URL, trimmed of trailing punctuation', () => {
    const match = scanServiceLogs(
      [row('', 'nothing'), row('', `Invoking ${APP_IO} with body=...`)],
      SCHEMA,
      registry,
    ).knownUrl;
    assert.strictEqual(match?.known.target, 'AppIO');
    assert.strictEqual(match.observedUrl, APP_IO);

    const trimmed = scanServiceLogs([row('', `called ${REGISTRIES}.`)], SCHEMA, registry).knownUrl;
    assert.strictEqual(trimmed?.observedUrl, REGISTRIES);
  });

  it('prefers ERROR and WARN URLs over INFO invocations regardless of row order', () => {
    for (const level of ['ERROR', 'WARN']) {
      const failure = row(level, `Request failed to GET ${REGISTRIES}`, '@message');
      assert.strictEqual(targetOf([invocation, failure]), 'pn-external-registries', level);
      assert.strictEqual(targetOf([failure, invocation]), 'pn-external-registries', level);
    }
  });

  it('uses failure keywords without a level but prefers an explicit failure level', () => {
    const implicitFailure = row('', `Exception calling ${REGISTRIES}`, '@message');
    assert.strictEqual(targetOf([invocation, implicitFailure]), 'pn-external-registries');
    assert.strictEqual(
      targetOf([implicitFailure, row('WARN', `Request failed to GET ${APP_IO}`, '@message')]),
      'AppIO',
    );
  });

  it('keeps the invocation when no failure row has a known URL, and the first URL at equal priority', () => {
    assert.strictEqual(targetOf([invocation, row('ERROR', 'Exception calling http://unknown.example/path')]), 'AppIO');
    assert.strictEqual(
      targetOf([row('WARN', `Request failed ${APP_IO}`), row('ERROR', `Request failed ${REGISTRIES}`)]),
      'AppIO',
    );
  });

  it('skips rows without a message and returns undefined when nothing matches or no registry is given', () => {
    assert.strictEqual(targetOf([logRow({ other: 'no message' }), row('', APP_IO)]), 'AppIO');
    assert.strictEqual(targetOf([row('', 'http://unknown.example/path')]), undefined);
    assert.strictEqual(scanServiceLogs([row('', APP_IO)], SCHEMA).knownUrl, undefined);
  });

  it('honours declaration order on overlapping prefixes', () => {
    const overlapping = new KnownUrlsRegistry([
      { url: 'https://api.io.pagopa.it/api/', target: 'AppIO-broad' },
      { url: 'https://api.io.pagopa.it/api/v1/', target: 'AppIO-v1' },
    ]);
    assert.strictEqual(targetOf([row('', APP_IO)], overlapping), 'AppIO-broad');
  });
});

describe('scanServiceLogs knownUrl and fallbackUuid pairing', () => {
  const routing = new KnownUrlsRegistry([
    { url: 'https://service-a.example/', target: 'service-a' },
    { url: 'https://service-b.example/', target: 'service-b' },
  ]);
  const invokeA = row('INFO', `Invoking https://service-a.example/call FALLBACK-UUID:${FIRST_UUID}`);

  it('pairs the selected failure URL with its own fallback UUID', () => {
    for (const level of ['ERROR', 'WARN', '']) {
      const scan = scanServiceLogs(
        [invokeA, row(level, `Error calling https://service-b.example/call FALLBACK-UUID:${SECOND_UUID}`)],
        SCHEMA,
        routing,
      );
      assert.deepStrictEqual([scan.knownUrl?.known.target, scan.fallbackUuid], ['service-b', SECOND_UUID], level);
    }
  });

  it('keeps the UUID paired with the first URL at equal priority', () => {
    const scan = scanServiceLogs(
      [
        row('ERROR', `Error calling https://service-a.example/call FALLBACK-UUID:${FIRST_UUID}`),
        row('ERROR', `Error calling https://service-b.example/call FALLBACK-UUID:${SECOND_UUID}`),
      ],
      SCHEMA,
      routing,
    );
    assert.deepStrictEqual([scan.knownUrl?.known.target, scan.fallbackUuid], ['service-a', FIRST_UUID]);
  });

  it('never borrows a UUID from another row, nor guesses one from an ambiguous row', () => {
    const borrowed = scanServiceLogs(
      [
        invokeA,
        row('ERROR', 'Error calling https://service-b.example/call'),
        row('ERROR', `Other operation FALLBACK-UUID:${SECOND_UUID}`),
      ],
      SCHEMA,
      routing,
    );
    assert.deepStrictEqual([borrowed.knownUrl?.known.target, borrowed.fallbackUuid], ['service-b', undefined]);

    for (const message of [
      `Error calling https://service-b.example/call FALLBACK-UUID:${FIRST_UUID} FALLBACK-UUID:${SECOND_UUID}`,
      `Error calling https://service-a.example/call and https://service-b.example/call FALLBACK-UUID:${SECOND_UUID}`,
    ]) {
      const scan = scanServiceLogs([row('ERROR', message)], SCHEMA, routing);
      assert.ok(scan.knownUrl, message);
      assert.strictEqual(scan.fallbackUuid, undefined, message);
    }
  });
});

describe('scanServiceLogs traceIdCandidate', () => {
  it('returns the first well-formed trace_id with its canonical form', () => {
    const cases: ReadonlyArray<readonly [string, ReadonlyArray<GOLogsInsightsResultField[]>, unknown]> = [
      [
        'a raw trace_id',
        [logRow({ trace_id: RAW_TRACE, '@message': 'foo' })],
        { raw: RAW_TRACE, canonical: CANONICAL_TRACE },
      ],
      [
        'an already canonical trace_id',
        [logRow({ trace_id: CANONICAL_TRACE })],
        { raw: CANONICAL_TRACE, canonical: CANONICAL_TRACE },
      ],
      [
        'the @trace_id alias',
        [logRow({ '@trace_id': 'aabbccddeeff00112233445566778899' })],
        { raw: 'aabbccddeeff00112233445566778899', canonical: '1-aabbccdd-eeff00112233445566778899' },
      ],
      [
        'the first well-formed one after malformed ones',
        [
          logRow({ trace_id: '-' }),
          logRow({ trace_id: 'not-hex' }),
          logRow({ trace_id: 'abcd1234abcd1234abcd1234abcd1234' }),
        ],
        { raw: 'abcd1234abcd1234abcd1234abcd1234', canonical: '1-abcd1234-abcd1234abcd1234abcd1234' },
      ],
      ['nothing without a trace_id field', [logRow({ '@message': 'hello' })], undefined],
    ];
    for (const [name, rows, expected] of cases) {
      assert.deepStrictEqual(scanServiceLogs(rows, SCHEMA).traceIdCandidate, expected, name);
    }
  });

  it('transforms a raw trace id into the X-Ray format and rejects malformed ones', () => {
    assert.strictEqual(transformRawTraceId(RAW_TRACE), CANONICAL_TRACE);
    assert.strictEqual(transformRawTraceId(CANONICAL_TRACE), CANONICAL_TRACE);
    for (const malformed of [
      'not-a-trace-id',
      '1-3d472be7-2977635208a92722b97b5e2',
      '2-3d472be7-2977635208a92722b97b5e24',
      '3d472be72977635208a92722b97b5e2',
      '',
    ]) {
      assert.strictEqual(transformRawTraceId(malformed), undefined, malformed);
    }
  });
});

describe('scanServiceLogs', () => {
  it('derives every projection in a single pass', () => {
    const registry = new KnownUrlsRegistry([{ url: 'https://api.io.pagopa.it/api/v1/activations/', target: 'AppIO' }]);
    const scan = scanServiceLogs(
      [
        logRow({
          level: 'ERROR',
          '@message': `Exception calling https://api.io.pagopa.it/api/v1/activations/123 "traceId":"FALLBACK-UUID:${FIRST_UUID}"`,
          trace_id: RAW_TRACE,
        }),
      ],
      SCHEMA,
      registry,
    );

    assert.match(scan.errorMessage, /Exception calling/);
    assert.strictEqual(scan.knownUrl?.known.target, 'AppIO');
    assert.strictEqual(scan.fallbackUuid, FIRST_UUID);
    assert.deepStrictEqual(scan.traceIdCandidate, { raw: RAW_TRACE, canonical: CANONICAL_TRACE });
  });
});
