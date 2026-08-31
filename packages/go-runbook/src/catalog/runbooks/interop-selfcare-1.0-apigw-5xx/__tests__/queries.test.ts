import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildInteropApiGw5xxAggregateQuery, buildInteropBff5xxApplicationLogsQuery } from '../queries.js';

describe('INTEROP Selfcare API Gateway queries', () => {
  it('builds the 5xx aggregate with an exact API Gateway id and an early numeric status filter', () => {
    const query = buildInteropApiGw5xxAggregateQuery('tf9isbi4pi');

    assert.match(query, /filter apigwId = "tf9isbi4pi"/u);
    assert.match(query, /filter status >= 500 and status < 600/u);
    assert.match(query, /stats count\(\*\) as count, latest\(@timestamp\) as latestTimestamp/u);
    assert.match(query, /by status, integrationStatus, integrationError, httpMethod, requestPath, sourceIp/u);
    assert.ok(query.indexOf('filter status') < query.indexOf('stats count'));
  });

  it('includes Response 5xx regardless of severity and keeps the BFF/adot filters', () => {
    const query = buildInteropBff5xxApplicationLogsQuery('interop-be-backend-for-frontend');

    assert.match(query, /@message like \/\(\?i\)Response\\s\*5\[0-9\]\{2\}\//u);
    assert.match(query, /@logStream not like \/adot-collector\//u);
    assert.match(query, /pod_app like \/interop\\-be\\-backend\\-for\\-frontend\//u);
    assert.match(query, /parse @message "\[CID=\*\]" as cid/u);
  });
});
