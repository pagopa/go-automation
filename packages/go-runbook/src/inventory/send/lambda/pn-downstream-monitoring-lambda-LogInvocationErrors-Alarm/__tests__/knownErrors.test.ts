import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KNOWN_ERRORS } from '../knownErrors.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { caseMatches, knownErrorById } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';

const AWS_SLOW_DOWN = 'SEND_LAMBDA_PDMLLIEA_DOW-MON-AWS-SLO-DOW';
const SLOW_DOWN = {
  $metadata: { httpStatusCode: 503 },
  errorMessage: 'Please reduce your request rate.',
  errorType: 'SlowDown',
};

function matches(id: string, message: string): boolean {
  return caseMatches(
    knownErrorById(KNOWN_ERRORS, id),
    createTestContext({
      stepResults: {
        'query-lambda-errors': [logRow({ '@requestId': 'b95bb742-cc30-4f07-80bc-45a38011e5c4', '@message': message })],
      },
    }),
  );
}

describe('pn-downstream-monitoring-lambda known errors', () => {
  it('matches the documented SlowDown 503 signature, also with reordered JSON', () => {
    for (const message of [
      'ERROR\tInvoke Error\t{"errorType":"SlowDown","errorMessage":"Please reduce your request rate.","$fault":"server","$metadata":{"httpStatusCode":503,"requestId":"request-1"}}',
      `ERROR Invoke Error ${JSON.stringify(SLOW_DOWN)}`,
    ]) {
      assert.strictEqual(matches(AWS_SLOW_DOWN, message), true, message);
    }
  });

  it('requires exact keys, types and values and refuses a generic or incomplete 503', () => {
    const message = `ERROR Invoke Error ${JSON.stringify(SLOW_DOWN)}`;
    for (const invalid of [
      'ERROR downstream returned HTTP 503',
      'ERROR Invoke Error {"errorType":"SlowDown","httpStatusCode":503}',
      message.replace('503', '5030'),
      message.replace('503', '503.5'),
      message.replace('503', '"503"'),
      message.replace('httpStatusCode', 'otherStatusCode'),
      message.replace('errorType', 'otherErrorType'),
      message.replace('SlowDown', 'SlowDownOther'),
      message.replace('request rate.', 'request rate. Other error'),
    ]) {
      assert.strictEqual(matches(AWS_SLOW_DOWN, invalid), false, invalid);
    }
  });

  it('distinguishes an S3 stack from an unidentified AWS SlowDown', () => {
    const message = `ERROR Invoke Error ${JSON.stringify({ ...SLOW_DOWN, stack: ['at S3RestXmlProtocol.handleError (...)'] })}`;
    assert.strictEqual(matches('SEND_LAMBDA_PDMLLIEA_DOW-MON-S3-SLO-DOW', message), true);
    assert.strictEqual(matches(AWS_SLOW_DOWN, message), false);
  });
});
