import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DownstreamDetectionQueryOptions } from '../buildDownstreamDetectionQuery.js';
import { buildDownstreamDetectionQuery } from '../buildDownstreamDetectionQuery.js';

describe('buildDownstreamDetectionQuery', () => {
  it('builds the optimized IPA query with the 404 exclusion', () => {
    assert.strictEqual(
      buildDownstreamDetectionQuery({ downstreamName: 'IPA', excludedStatusCodes: [404] }),
      `filter @message like '[DOWNSTREAM] Service IPA returned errors='
    and @message not like '[DOWNSTREAM] Service IPA returned errors=404'
| fields @timestamp, level, trace_id, message, @message
| sort @timestamp asc
| limit 1000`,
    );
  });

  it('deduplicates and orders excluded status codes deterministically', () => {
    const query = buildDownstreamDetectionQuery({
      downstreamName: 'POSTEL',
      excludedStatusCodes: [503, 404, 503],
      resultLimit: 250,
    });

    assert.match(query, /errors=404'\n {4}and @message not like .*errors=503'/);
    assert.match(query, /\| limit 250$/);
  });

  it('escapes a downstream name before interpolating it into the query', () => {
    const query = buildDownstreamDetectionQuery({ downstreamName: "Partner's API" });

    assert.match(query, /Partner\\'s API/);
  });

  it('builds the generic query for alarms covering every emitted service name', () => {
    assert.strictEqual(
      buildDownstreamDetectionQuery({ matchAnyService: true }),
      `filter level = 'ERROR'
    and @message like '[DOWNSTREAM]'
    and @message like 'returned errors='
| fields @timestamp, level, trace_id, message, @message
| sort @timestamp asc
| limit 1000`,
    );
  });

  it('rejects invalid options', () => {
    assert.throws(() => buildDownstreamDetectionQuery({ downstreamName: ' ' }), /downstreamName/);
    assert.throws(
      () => buildDownstreamDetectionQuery({ downstreamName: 'IPA', excludedStatusCodes: [99] }),
      /status codes/,
    );
    assert.throws(() => buildDownstreamDetectionQuery({ downstreamName: 'IPA', resultLimit: 0 }), /resultLimit/);
  });

  it('rejects exact-service options on the generic variant instead of ignoring them', () => {
    // Every call here is a compile error for a typed caller: these options
    // live in the exact-service arm of the union. The assertions bypass that on
    // purpose, because the runtime guard is what protects options assembled
    // dynamically, and because an option that silently does nothing — or worse,
    // silently widens the query — is the bug being tested.
    const untyped = (options: Record<string, unknown>): string =>
      buildDownstreamDetectionQuery(options as unknown as DownstreamDetectionQueryOptions);

    // Neither variant selected: the name is mandatory in the exact arm, so a
    // typed caller cannot get here, and the message has to say what is missing
    // rather than let `.trim()` throw on undefined.
    assert.throws(() => untyped({}), /downstreamName/);

    // The strictest of the three: ignoring a downstreamName would widen the
    // query to every service rather than narrow it, so the caller would get an
    // answer to a question it did not ask.
    assert.throws(() => untyped({ matchAnyService: true, downstreamName: 'IPA' }), /mutually exclusive/);
    assert.throws(() => untyped({ matchAnyService: true, excludedStatusCodes: [404] }), /exact downstreamName/);
    assert.throws(() => untyped({ matchAnyService: true, matchStructuredMessage: true }), /exact downstreamName/);
    // `false` asks for the same thing as `true` here — neither is buildable —
    // so it must be rejected rather than read as "nothing requested".
    assert.throws(() => untyped({ matchAnyService: true, matchStructuredMessage: false }), /exact downstreamName/);
  });
});
