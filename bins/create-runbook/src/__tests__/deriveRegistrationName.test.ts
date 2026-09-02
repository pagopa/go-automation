import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deriveRegistrationName } from '../naming/deriveRegistrationName.js';

describe('deriveRegistrationName', () => {
  it('drops the pn- prefix and converts the id to CONSTANT_CASE', () => {
    assert.strictEqual(deriveRegistrationName('pn-delivery-B2B-ApiGwAlarm'), 'DELIVERY_B2B_API_GW_ALARM_REGISTRATION');
  });

  it('keeps acronyms together', () => {
    assert.strictEqual(
      deriveRegistrationName('pn-national-registries-PNPG-ApiGwAlarm'),
      'NATIONAL_REGISTRIES_PNPG_API_GW_ALARM_REGISTRATION',
    );
  });

  it('only strips a leading pn-', () => {
    assert.strictEqual(
      deriveRegistrationName('workday-pn-external-channel-alb-alarm'),
      'WORKDAY_PN_EXTERNAL_CHANNEL_ALB_ALARM_REGISTRATION',
    );
  });

  it('handles an id that is already lower-kebab', () => {
    assert.strictEqual(
      deriveRegistrationName('emd-downstream-detection-Alarm'),
      'EMD_DOWNSTREAM_DETECTION_ALARM_REGISTRATION',
    );
  });

  it('always produces a valid TypeScript identifier for any accepted id', () => {
    // A runbook id accepts "." and may start with a digit (runbookIdError), but
    // the derived name is written as `export const <name>` into registration.ts.
    const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
    for (const id of [
      'pn-delivery-B2B-ApiGwAlarm',
      'interop-selfcare-1.0-apigw-5xx',
      '5xx-gateway-errors',
      'pn-delivery.push-B2B',
      'pn-.foo',
      'pn-1',
    ]) {
      assert.ok(identifier.test(deriveRegistrationName(id)), `${id} produced an invalid identifier`);
    }
  });

  it('turns a dot into a separator instead of leaving it in the name', () => {
    assert.strictEqual(
      deriveRegistrationName('interop-selfcare-1.0-apigw-5xx'),
      'INTEROP_SELFCARE_1_0_APIGW_5XX_REGISTRATION',
    );
  });

  it('prefixes a digit-leading name, which cannot open an identifier', () => {
    assert.strictEqual(deriveRegistrationName('5xx-gateway-errors'), 'RUNBOOK_5XX_GATEWAY_ERRORS_REGISTRATION');
  });

  it('collapses repeated separators and drops the leading ones left by pn-', () => {
    assert.strictEqual(deriveRegistrationName('pn-a--b'), 'A_B_REGISTRATION');
    assert.strictEqual(deriveRegistrationName('pn-.foo'), 'FOO_REGISTRATION');
  });
});
