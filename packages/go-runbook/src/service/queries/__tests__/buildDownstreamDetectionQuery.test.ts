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
    // Both calls are compile errors for a typed caller: the options live in the
    // exact-service arm of the union. The assertions bypass that on purpose,
    // because the runtime guard is what protects options assembled dynamically,
    // and because an option that silently does nothing is the bug being tested.
    const generic = (options: Record<string, unknown>): string =>
      buildDownstreamDetectionQuery(options as unknown as DownstreamDetectionQueryOptions);

    assert.throws(() => generic({ matchAnyService: true, excludedStatusCodes: [404] }), /exact downstreamName/);
    assert.throws(() => generic({ matchAnyService: true, matchStructuredMessage: true }), /exact downstreamName/);
    // `false` asks for the same thing as `true` here — neither is buildable —
    // so it must be rejected rather than read as "nothing requested".
    assert.throws(() => generic({ matchAnyService: true, matchStructuredMessage: false }), /exact downstreamName/);
  });
});
