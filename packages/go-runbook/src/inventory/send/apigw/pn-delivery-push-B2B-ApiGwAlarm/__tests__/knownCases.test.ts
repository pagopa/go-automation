import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { KNOWN_CASES } from '../knownCases.js';

const TIMEOUT = 'delivery-push-endpoint-request-timeout-504';
const DOCUMENT_KEY = 'safestorage-document-key-not-present-in-db';

function ids(vars: Record<string, string>, steps: Record<string, unknown> = {}): ReadonlyArray<string> {
  return matchingCaseIds(KNOWN_CASES, createTestContext({ vars, stepResults: steps }));
}

describe('pn-delivery-push-B2B-ApiGwAlarm known cases', () => {
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
