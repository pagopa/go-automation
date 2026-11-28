import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { KNOWN_ERRORS } from '../apigw/pn-national-registries-PNPG-ApiGwAlarm/knownErrors.js';
import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import { caseMatches, knownErrorById } from '../../../__tests__/helpers/knownErrorMatching.js';
import type { TestContextOptions } from '../../../__tests__/helpers/TestContextOptions.js';

const AUTHENTICATION = 'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/authentication';
const ADE_TIMEOUT_VARS = {
  apiGwStatusCode: '504',
  nationalRegistriesLookupState: 'queried',
  nationalRegistriesLogCount: '0',
  apiGwErrorMessage: 'Endpoint request timed out',
  apiGwHttpMethod: 'POST',
};

/** Context with national-registries messages and API Gateway variables. */
function evidence(messages: ReadonlyArray<string>, vars: Readonly<Record<string, string>> = {}): TestContextOptions {
  return { vars, stepResults: { 'query-pn-national-registries': messages } };
}

describe('PNPG national registries API Gateway known errors', () => {
  it('matches each documented signature, with or without a query string, and the AdE timeout only on its path', () => {
    for (const [id, options, expected] of [
      [
        'SEND_APIGW_PNRPNPGAGA_API-504-ADE-LEG-TIM-NO-SER-LOG',
        evidence([], { ...ADE_TIMEOUT_VARS, apiGwPath: '/national-registries-private/agenzia-entrate/legal' }),
        true,
      ],
      [
        'SEND_APIGW_PNRPNPGAGA_API-504-ADE-LEG-TIM-NO-SER-LOG',
        evidence([], { ...ADE_TIMEOUT_VARS, apiGwPath: '/national-registries-private/infocamere/legal-institutions' }),
        false,
      ],
      [
        'SEND_APIGW_PNRPNPGAGA_DOW-INF-500-AUT',
        evidence([
          `[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from POST ${AUTHENTICATION}`,
        ]),
        true,
      ],
      [
        'SEND_APIGW_PNRPNPGAGA_DOW-INF-500-AUT',
        evidence([
          `[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from POST ${AUTHENTICATION}?client_id=pn`,
        ]),
        true,
      ],
      [
        'SEND_APIGW_PNRPNPGAGA_DOW-INF-CON-RES-AUT',
        evidence([
          '[DOWNSTREAM] Service InfoCamere returned errors=recvAddress(..) failed: Connection reset by peer\n' +
            'org.springframework.web.reactive.function.client.WebClientRequestException\n' +
            `Request to POST ${AUTHENTICATION} [DefaultWebClient]`,
        ]),
        true,
      ],
      [
        'SEND_APIGW_PNRPNPGAGA_DOW-INF-REA-TIM-AUT',
        evidence(
          [
            '[DOWNSTREAM] Service InfoCamere returned errors=<not specified>\n' +
              `Request to POST ${AUTHENTICATION} [DefaultWebClient]\n` +
              'Caused by: io.netty.handler.timeout.ReadTimeoutException: null',
          ],
          {
            apiGwStatusCode: '504',
            nationalRegistriesLogCount: '1',
            apiGwErrorMessage: 'Endpoint request timed out',
            apiGwPath: '/national-registries-private/infocamere/legal-institutions',
          },
        ),
        true,
      ],
    ] as const) {
      assert.strictEqual(caseMatches(knownErrorById(KNOWN_ERRORS, id), createTestContext(options)), expected, id);
    }
  });
});
