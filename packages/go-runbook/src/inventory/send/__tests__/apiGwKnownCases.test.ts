import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { KNOWN_CASES } from '../apigw/pn-national-registries-PNPG-ApiGwAlarm/knownCases.js';
import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import { caseMatches, knownCaseById } from '../../../__tests__/helpers/knownCaseMatching.js';
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

describe('PNPG national registries API Gateway known cases', () => {
  it('matches each documented signature, with or without a query string, and the AdE timeout only on its path', () => {
    for (const [id, options, expected] of [
      [
        'apigw-504-ade-legal-timeout-no-service-logs',
        evidence([], { ...ADE_TIMEOUT_VARS, apiGwPath: '/national-registries-private/agenzia-entrate/legal' }),
        true,
      ],
      [
        'apigw-504-ade-legal-timeout-no-service-logs',
        evidence([], { ...ADE_TIMEOUT_VARS, apiGwPath: '/national-registries-private/infocamere/legal-institutions' }),
        false,
      ],
      [
        'downstream-infocamere-500-authentication',
        evidence([
          `[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from POST ${AUTHENTICATION}`,
        ]),
        true,
      ],
      [
        'downstream-infocamere-500-authentication',
        evidence([
          `[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from POST ${AUTHENTICATION}?client_id=pn`,
        ]),
        true,
      ],
      [
        'downstream-infocamere-connection-reset-authentication',
        evidence([
          '[DOWNSTREAM] Service InfoCamere returned errors=recvAddress(..) failed: Connection reset by peer\n' +
            'org.springframework.web.reactive.function.client.WebClientRequestException\n' +
            `Request to POST ${AUTHENTICATION} [DefaultWebClient]`,
        ]),
        true,
      ],
      [
        'downstream-infocamere-read-timeout-authentication',
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
      assert.strictEqual(caseMatches(knownCaseById(KNOWN_CASES, id), createTestContext(options)), expected, id);
    }
  });
});
