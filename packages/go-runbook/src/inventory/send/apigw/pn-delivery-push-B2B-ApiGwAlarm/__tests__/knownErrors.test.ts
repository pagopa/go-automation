import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { KNOWN_ERRORS } from '../knownErrors.js';

const TIMEOUT = 'SEND_APIGW_PDPB2BAGA_DEL-PUS-END-REQ-TIM-504';
const DOCUMENT_KEY = 'SEND_APIGW_PDPB2BAGA_SAF-DOC-KEY-NOT-PRE-IN-DB';

function ids(vars: Record<string, string>, steps: Record<string, unknown> = {}): ReadonlyArray<string> {
  return matchingKnownErrorCodes(KNOWN_ERRORS, createTestContext({ vars, stepResults: steps }));
}

describe('pn-delivery-push-B2B-ApiGwAlarm known errors', () => {
  it('recognizes the API Gateway 504 timeout without backend errors', () => {
    assert.deepStrictEqual(ids({ apiGwStatusCode: '504', apiGwErrorMessage: 'Endpoint request timed out' }), [TIMEOUT]);
    assert.ok(!ids({ apiGwStatusCode: '500', apiGwErrorMessage: 'Endpoint request timed out' }).includes(TIMEOUT));
  });

  it('recognizes the document key missing from the SafeStorage table in SafeStorage or delivery-push logs', () => {
    const line = "Document key not present in DB 'PN_EXTERNAL_LEGAL_FACTS-afd6ea092e3b44aa98e572ec6d8b8242.pdf'";
    for (const step of ['query-pn-safestorage', 'query-pn-delivery-push']) {
      assert.deepStrictEqual(ids({ apiGwStatusCode: '404' }, { [step]: [line] }), [DOCUMENT_KEY], step);
    }
  });
});
