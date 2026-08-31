import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';

const PROFILE = interop.apigw.INTEROP_API_GW_4XX_SERVICE_WARNINGS_PROFILE;
import { INTEROP_AUTH_SERVER_POD_APP_FILTER } from '../resolveInteropAlarmContext.js';

describe('INTEROP auth-server API Gateway queries', () => {
  it('uses the optimized numeric 4xx range and retains the diagnostic dimensions', () => {
    const query = PROFILE.buildApiGwAggregateQuery('ffmbmcmreh');

    assert.match(query, /filter apigwId = "ffmbmcmreh"/u);
    assert.match(query, /filter status >= 400 and status < 500/u);
    assert.match(query, /status, integrationStatus, integrationError, httpMethod, requestPath, sourceIp/u);
    assert.match(query, /latest\(@timestamp\) as latestTimestamp/u);
    assert.match(query, /limit 10000/u);
  });

  it('filters auth-server warnings, excludes non-causal invalid claims and retains a sample CID', () => {
    const query = PROFILE.buildApplicationLogsQuery(INTEROP_AUTH_SERVER_POD_APP_FILTER);

    assert.match(query, /pod_app like \/interop\\-be\\-authorization\\-server\//u);
    assert.doesNotMatch(query, /authorization\\-server\\-node/u);
    assert.match(query, /@message like \/WARN\//u);
    assert.match(query, /@message not like \/Invalid claims in client assertion payload\//u);
    assert.match(query, /latest\(cidValue\) as cid/u);
    assert.match(query, /by errorMessage/u);
    assert.match(query, /display latestTimestamp, count, cid, errorMessage/u);
  });
});
