import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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

  it('rejects invalid options', () => {
    assert.throws(() => buildDownstreamDetectionQuery({ downstreamName: ' ' }), /downstreamName/);
    assert.throws(
      () => buildDownstreamDetectionQuery({ downstreamName: 'IPA', excludedStatusCodes: [99] }),
      /status codes/,
    );
    assert.throws(() => buildDownstreamDetectionQuery({ downstreamName: 'IPA', resultLimit: 0 }), /resultLimit/);
  });
});
