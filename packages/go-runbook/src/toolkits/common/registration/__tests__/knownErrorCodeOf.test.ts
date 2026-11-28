import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { knownErrorCodeOf } from '../knownErrorCodeOf.js';

describe('knownErrorCodeOf', () => {
  it('composes product, family, runbook acronym and abbreviation, on the documented examples', () => {
    assert.strictEqual(
      knownErrorCodeOf(
        'INTEROP',
        'K8S',
        'k8s-interop-be-attribute-registry-readmodel-writer-sql-errors',
        'attribute-registry-temporary-network-errors',
      ),
      'INTEROP_K8S_K8IBARRWSE_ATT-REG-TEM-NET-ERR',
    );
    assert.strictEqual(
      knownErrorCodeOf('INTEROP', 'APIGW', 'interop-api-v2-apigw-5xx', 'api-v2-backend-timeout-504'),
      'INTEROP_APIGW_IAV2A5_API-V2-BAC-TIM-504',
    );
    assert.strictEqual(
      knownErrorCodeOf('SEND', 'LAMBDA', 'pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm', 'jwks-uci-bad-gateway'),
      'SEND_LAMBDA_PJCRLLIEA_JWK-UCI-BAD-GAT',
    );
  });

  it('keeps uppercase words whole and the digits of the others, so v2 and v3 stay apart', () => {
    assert.strictEqual(
      knownErrorCodeOf('SEND', 'APIGW', 'pn-delivery-B2B-ApiGwAlarm', 'pdv-tokenizer-404-tbd'),
      'SEND_APIGW_PDB2BAGA_PDV-TOK-404-TBD',
    );
    assert.notStrictEqual(
      knownErrorCodeOf('INTEROP', 'APIGW', 'interop-api-v2-apigw-5xx', 'x'),
      knownErrorCodeOf('INTEROP', 'APIGW', 'interop-api-v3-apigw-5xx', 'x'),
    );
    assert.strictEqual(
      knownErrorCodeOf('SEND', 'DOWNSTREAM', 'pn-national-registries-IPA-downstream-detection-Alarm', 'ipa-500'),
      'SEND_DOWNSTREAM_PNRIPADDA_IPA-500',
    );
  });

  it('splits a word only where a lowercase letter meets an uppercase one', () => {
    assert.strictEqual(
      knownErrorCodeOf('SEND', 'SERVICE', 'spidhub-prod-ExternalELBAlarm', 'spidhub-saml-response'),
      'SEND_SERVICE_SPEE_SPI-SAM-RES',
    );
    assert.strictEqual(
      knownErrorCodeOf('SEND', 'LAMBDA', 'pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm', 'x'),
      'SEND_LAMBDA_PAKAV2LIEA_X',
    );
  });

  it('gives the COMMON acronym to a known error a family adds to several runbooks', () => {
    assert.strictEqual(
      knownErrorCodeOf('SEND', 'LAMBDA', undefined, 'lambda-out-of-memory'),
      'SEND_LAMBDA_COMMON_LAM-OUT-OF-MEM',
    );
  });
});
