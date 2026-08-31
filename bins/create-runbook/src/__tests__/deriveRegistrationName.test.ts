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
});
