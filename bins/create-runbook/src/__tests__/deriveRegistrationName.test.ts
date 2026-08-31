import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deriveRegistrationName } from '../naming/deriveRegistrationName.js';

describe('deriveRegistrationName', () => {
  it('drops the build/Runbook affixes and converts to CONSTANT_CASE', () => {
    assert.strictEqual(
      deriveRegistrationName('buildDeliveryB2BApiGwAlarmRunbook'),
      'DELIVERY_B2B_API_GW_ALARM_REGISTRATION',
    );
  });

  it('keeps acronyms together', () => {
    assert.strictEqual(
      deriveRegistrationName('buildNationalRegistriesPNPGApiGwAlarmRunbook'),
      'NATIONAL_REGISTRIES_PNPG_API_GW_ALARM_REGISTRATION',
    );
  });

  it('handles a name without affixes', () => {
    assert.strictEqual(deriveRegistrationName('EmdDownstreamDetection'), 'EMD_DOWNSTREAM_DETECTION_REGISTRATION');
  });
});
