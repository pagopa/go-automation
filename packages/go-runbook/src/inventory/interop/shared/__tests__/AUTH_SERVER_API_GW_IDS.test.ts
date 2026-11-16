import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { INTEROP_ENVIRONMENTS } from '../../../../toolkits/interop/index.js';
import { AUTH_SERVER_ALARM } from '../../apigw/interop-auth-server-apigw-4xx/alarmDefinition.js';
import { AUTH_SERVER_5XX_ALARM } from '../../apigw/interop-auth-server-apigw-5xx/alarmDefinition.js';
import { AUTH_SERVER_API_GW_IDS } from '../AUTH_SERVER_API_GW_IDS.js';

describe('AUTH_SERVER_API_GW_IDS', () => {
  it('is the API Gateway that both auth-server alarms resolve in every environment', () => {
    for (const environment of INTEROP_ENVIRONMENTS) {
      for (const alarm of [AUTH_SERVER_ALARM, AUTH_SERVER_5XX_ALARM]) {
        const alarmName = alarm.alarmNames.find((name) => name.includes(`-${environment}-`));
        assert.ok(alarmName !== undefined);
        assert.equal(alarm.resolveContext(alarmName).apiGwId, AUTH_SERVER_API_GW_IDS[environment]);
      }
    }
  });
});
