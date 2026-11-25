import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AUTH_SERVER_ALARM } from '../alarmDefinition.js';
import { AUTH_SERVER_4XX_QUERY_PROFILE } from '../queryProfile.js';

describe('INTEROP auth-server API Gateway queries', () => {
  it('filters auth-server warnings, excludes non-causal invalid claims and retains a sample CID', () => {
    // The auth-server filters on the broader pod family, not on serviceName.
    assert.ok(AUTH_SERVER_ALARM.podAppFilter !== undefined);
    const query = AUTH_SERVER_4XX_QUERY_PROFILE.buildApplicationLogsQuery(AUTH_SERVER_ALARM.podAppFilter);

    assert.match(query, /pod_app like \/interop\\-be\\-authorization\\-server\//u);
    assert.doesNotMatch(query, /authorization\\-server\\-node/u);
    assert.match(query, /@message like \/WARN\//u);
    assert.match(query, /@message not like \/Invalid claims in client assertion payload\//u);
    assert.match(query, /latest\(cidValue\) as cid/u);
    assert.match(query, /by errorMessage/u);
    assert.match(query, /display firstTimestamp, latestTimestamp, count, cid, errorMessage/u);
  });
});
