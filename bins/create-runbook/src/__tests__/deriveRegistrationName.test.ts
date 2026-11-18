import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deriveRegistrationName } from '../naming/deriveRegistrationName.js';

/** A valid TypeScript identifier: the derived name is written as `export const <name>`. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

describe('deriveRegistrationName', () => {
  // A runbook id accepts "." and may start with a digit (runbookIdError): every derived name
  // must still be a valid identifier.
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ['drops the pn- prefix and converts to CONSTANT_CASE', 'pn-delivery-B2B-ApiGwAlarm', 'DELIVERY_B2B_API_GW_ALARM'],
    ['keeps acronyms together', 'pn-national-registries-PNPG-ApiGwAlarm', 'NATIONAL_REGISTRIES_PNPG_API_GW_ALARM'],
    ['only strips a leading pn-', 'workday-pn-external-channel-alb-alarm', 'WORKDAY_PN_EXTERNAL_CHANNEL_ALB_ALARM'],
    ['handles an id that is already lower-kebab', 'emd-downstream-detection-Alarm', 'EMD_DOWNSTREAM_DETECTION_ALARM'],
    ['turns a dot into a separator', 'interop-selfcare-1.0-apigw-5xx', 'INTEROP_SELFCARE_1_0_APIGW_5XX'],
    ['turns an inner dot into a separator', 'pn-delivery.push-B2B', 'DELIVERY_PUSH_B2B'],
    ['prefixes a digit-leading name', '5xx-gateway-errors', 'RUNBOOK_5XX_GATEWAY_ERRORS'],
    ['prefixes a digit left after pn-', 'pn-1', 'RUNBOOK_1'],
    ['collapses repeated separators', 'pn-a--b', 'A_B'],
    ['drops the leading separators left by pn-', 'pn-.foo', 'FOO'],
  ];

  for (const [name, id, expected] of cases) {
    it(`${name}: ${id}`, () => {
      const derived = deriveRegistrationName(id);
      assert.strictEqual(derived, `${expected}_REGISTRATION`);
      assert.match(derived, IDENTIFIER);
    });
  }
});
