import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildInteropApiGwServiceErrorsQuery } from '../queries/interopApiGwApplicationQueries.js';

describe('buildInteropApiGwServiceErrorsQuery', () => {
  it('keeps the standard error predicates when no extra marker is configured', () => {
    const query = buildInteropApiGwServiceErrorsQuery('interop-be-backend-for-frontend');

    assert.match(query, /ERROR.*stderr.*Response/u);
    assert.doesNotMatch(query, /undefined/u);
  });

  it('adds escaped literal markers to the application-log severity filter', () => {
    const query = buildInteropApiGwServiceErrorsQuery('interop-be-authorization-server', [
      'Main auditing flow failed, going through fallback',
      'marker/with.regex',
    ]);

    assert.match(query, /@message like \/Main auditing flow failed, going through fallback\//u);
    assert.ok(query.includes('@message like /marker\\/with\\.regex/'));
    assert.ok(query.includes('pod_app like /interop\\-be\\-authorization\\-server/'));
  });
});
