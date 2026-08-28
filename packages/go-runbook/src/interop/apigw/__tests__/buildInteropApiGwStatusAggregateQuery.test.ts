import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildInteropApiGwStatusAggregateQuery } from '../queries/buildInteropApiGwStatusAggregateQuery.js';

describe('buildInteropApiGwStatusAggregateQuery', () => {
  it('builds numeric 4xx and 5xx ranges and retains each diagnostic dimension', () => {
    const query4xx = buildInteropApiGwStatusAggregateQuery('api-4xx', 4);
    const query5xx = buildInteropApiGwStatusAggregateQuery('api-5xx', 5);

    assert.match(query4xx, /status >= 400 and status < 500/u);
    assert.match(query5xx, /status >= 500 and status < 600/u);
    assert.match(query4xx, /httpMethod, requestPath, sourceIp/u);
    assert.match(query4xx, /sort count desc/u);
  });

  it('escapes an API Gateway id before interpolating it', () => {
    const query = buildInteropApiGwStatusAggregateQuery('api"\\id', 4);
    assert.match(query, /apigwId = "api\\"\\\\id"/u);
  });
});
