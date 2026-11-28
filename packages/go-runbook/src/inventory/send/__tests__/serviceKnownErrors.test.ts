import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { KnownError } from '../../../engine/index.js';

import { KNOWN_ERRORS as EMD_CASES } from '../downstream/emd-downstream-detection-Alarm/knownErrors.js';
import { KNOWN_ERRORS as SELFCARE_CASES } from '../downstream/personal-data-vault-SelfcarePG-downstream-detection-Alarm/knownErrors.js';
import { KNOWN_ERRORS as POSTEL_CASES } from '../downstream/pn-address-manager-POSTEL-downstream-detection-Alarm/knownErrors.js';
import { KNOWN_ERRORS as ONE_TRUST_CASES } from '../downstream/pn-external-registries-OneTrust-downstream-detection-Alarm/knownErrors.js';
import { KNOWN_ERRORS as ADE_CASES } from '../downstream/pn-national-registries-AdE-downstream-detection-Alarm/knownErrors.js';
import { KNOWN_ERRORS as ANPR_CASES } from '../downstream/pn-national-registries-ANPR-downstream-detection-Alarm/knownErrors.js';
import { KNOWN_ERRORS as INFOCAMERE_CASES } from '../downstream/pn-national-registries-InfoCamere-downstream-detection-Alarm/knownErrors.js';
import { KNOWN_ERRORS as INAD_CASES } from '../downstream/pn-national-registries-INAD-downstream-detection-Alarm/knownErrors.js';
import { KNOWN_ERRORS as IPA_CASES } from '../downstream/pn-national-registries-IPA-downstream-detection-Alarm/knownErrors.js';
import { KNOWN_ERRORS as EXTERNAL_CHANNEL_CASES } from '../service/workday-pn-external-channel-alb-alarm/knownErrors.js';
import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import { caseMatches, matchingKnownErrorCodes, knownErrorById } from '../../../__tests__/helpers/knownErrorMatching.js';
import { logRow } from '../../../__tests__/helpers/logRow.js';

const NATIONAL_REGISTRIES = 'query-pn-national-registries';
const IPA_503 =
  '[DOWNSTREAM] Service IPA returned errors=503 Service Unavailable from POST ' +
  'https://www.indicepa.gov.it/ws/WS23DOMDIGCFServices/api/WS23_DOM_DIG_CF';
const ANPR_ENDPOINT =
  'https://modipa.anpr.interno.it/govway/rest/in/MinInternoPortaANPR-PDND/C001-servizioNotifica/v1/anpr-service-e002';
const EMD_SEND_MESSAGE = 'https://api-emd.cstar.pagopa.it/emd/message-core/sendMessage';
const INFOCAMERE_LEGAL_REPRESENTATIVE =
  '[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from GET ' +
  'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/listaLegaleRappresentante/';
const INFOCAMERE_AUTHENTICATION = 'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/authentication';

/** A known-error expectation: the case, the step whose rows it reads and those rows. */
interface Evidence {
  readonly cases: ReadonlyArray<KnownError>;
  readonly knownErrorCode: string;
  readonly stepId: string;
  readonly rows: ReadonlyArray<unknown>;
}

/** Evidence of a single `@message` row. */
function message(
  cases: ReadonlyArray<KnownError>,
  knownErrorCode: string,
  value: string,
  stepId: string = NATIONAL_REGISTRIES,
): Evidence {
  return { cases, knownErrorCode, stepId, rows: [logRow({ '@message': value })] };
}

function matches({ cases, knownErrorCode, stepId, rows }: Evidence): boolean {
  return caseMatches(knownErrorById(cases, knownErrorCode), createTestContext({ stepResults: { [stepId]: rows } }));
}

describe('service runbook known errors', () => {
  it('matches every documented downstream signature', () => {
    const documented: ReadonlyArray<Evidence> = [
      {
        cases: EXTERNAL_CHANNEL_CASES,
        knownErrorCode: 'SEND_SERVICE_WPECAA_DUP-EVE-400-02',
        stepId: 'query-pn-external-channel',
        rows: [
          'sendPaperProgressStatusRequest syntax/semantic errors : result code = \'400.02\' : result description = \'Errore di validazione regole semantiche\' : specific errors identified = [DUPLICATED_EVENT] ERR_CONS - {"errorList":[{"error":"[ERR_CONS_DUPLICATED_EVENT]"}]}',
        ],
      },
      {
        cases: EXTERNAL_CHANNEL_CASES,
        knownErrorCode: 'SEND_SERVICE_WPECAA_DUP-EVE-ERR-CON',
        stepId: 'query-pn-external-channel',
        rows: [
          logRow({
            level: 'ERROR',
            '@message':
              '{"message":"ERR_CONS - {\\"request\\":[{\\"requestId\\":\\"PREPARE_ANALOG_DOMICILE.IUN_VGYH-HDTK-NEWA-202603-W-1\\"}], \\"errorList\\":[{\\"error\\": \\"[ERR_CONS_DUPLICATED_EVENT]\\", \\"description\\": \\"The request has duplicated events\\"}]}","trace_id":"6a1d12cde853a9726be9c7c20da54682"}',
          }),
        ],
      },
      {
        cases: IPA_CASES,
        knownErrorCode: 'SEND_DOWNSTREAM_PNRIPADDA_IPA-SER-UNA-503',
        stepId: NATIONAL_REGISTRIES,
        rows: [logRow({ level: 'ERROR', message: IPA_503, '@message': IPA_503 })],
      },
      message(
        IPA_CASES,
        'SEND_DOWNSTREAM_PNRIPADDA_IPA-CON-PRE-CLO',
        '[DOWNSTREAM] Service IPA returned errors=Connection prematurely closed BEFORE response',
      ),
      message(
        ADE_CASES,
        'SEND_DOWNSTREAM_PNRAEDDA_ADE-LEG-REP-INT-SER-ERR-500',
        '[DOWNSTREAM] Service AdE returned errors=500 Internal Server Error from POST ' +
          'https://gatewaywebservices.agenziaentrate.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService',
      ),
      message(
        ADE_CASES,
        'SEND_DOWNSTREAM_PNRAEDDA_ADE-LEG-REP-REA-TIM',
        '[DOWNSTREAM] Service AdE returned errors=<not specified>\n' +
          'Request to POST https://gatewaywebservices.agenziaentrate.it/SPCBooleanoRappWS/' +
          'VerificaRappresentanteEnteService failed\n' +
          'io.netty.handler.timeout.ReadTimeoutException',
      ),
      message(
        ADE_CASES,
        'SEND_DOWNSTREAM_PNRAEDDA_ADE-REA-TIM',
        '[DOWNSTREAM] Service AdE returned errors=nested exception is io.netty.handler.timeout.ReadTimeoutException',
      ),
      message(
        INAD_CASES,
        'SEND_DOWNSTREAM_PNRINADDDA_INA-SER-UNA-503',
        '[DOWNSTREAM] Service INAD returned errors=503 Service Unavailable from GET https://inad.gov.it',
      ),
      message(
        INAD_CASES,
        'SEND_DOWNSTREAM_PNRINADDDA_INA-UNA-AFT-TOK-REF-401',
        '[DOWNSTREAM] Service INAD returned errors=401 Unauthorized from GET ' +
          'https://domiciliodigitaleapi.oscl.infocamere.it/rest/inad/v1/domiciliodigitale/extract/',
      ),
      message(
        INAD_CASES,
        'SEND_DOWNSTREAM_PNRINADDDA_INA-CON-TIM',
        '[DOWNSTREAM] Service INAD returned errors=connection timed out after 3000 ms: api.inad.gov.it/80.82.15.226:443',
      ),
      message(
        INAD_CASES,
        'SEND_DOWNSTREAM_PNRINADDDA_INA-CON-RES-BY-PEE',
        '[DOWNSTREAM] Service INAD returned errors=recvAddress(..) failed: Connection reset by peer',
      ),
      message(
        INAD_CASES,
        'SEND_DOWNSTREAM_PNRINADDDA_INA-DIG-DOM-INT-SER-ERR-500',
        '[DOWNSTREAM] Service INAD returned errors=500 Internal Server Error from GET ' +
          'https://api.inad.gov.it/rest/inad/v1/domiciliodigitale/extract/RKASLN96R24C219Z',
      ),
      message(
        INFOCAMERE_CASES,
        'SEND_DOWNSTREAM_PNRICDDA_INF-LEG-REP-INT-SER-ERR-500',
        `${INFOCAMERE_LEGAL_REPRESENTATIVE}ABCDEF12G34H567I;` +
          '{"code":"WSPA_ERR_00","appName":"wspa-lref","description":"Internal Server Error!"}',
      ),
      ...[
        { message: `${INFOCAMERE_LEGAL_REPRESENTATIVE}***;{"appName": "wspa-lref", "code": "WSPA_ERR_00"}` },
        {
          '@message': JSON.stringify({
            message: `${INFOCAMERE_LEGAL_REPRESENTATIVE}***;{"appName": "wspa-lref", "code": "WSPA_ERR_00"}`,
            level: 'ERROR',
          }),
        },
      ].map((fields) => ({
        cases: INFOCAMERE_CASES,
        knownErrorCode: 'SEND_DOWNSTREAM_PNRICDDA_INF-LEG-REP-INT-SER-ERR-500',
        stepId: NATIONAL_REGISTRIES,
        rows: [logRow(fields)],
      })),
      message(
        INFOCAMERE_CASES,
        'SEND_DOWNSTREAM_PNRICDDA_INF-RIC-ELE-PEC-REA-TIM',
        '[DOWNSTREAM] Service InfoCamere returned errors=Unknown error ' +
          'org.springframework.web.reactive.function.client.WebClientRequestException: null\n' +
          'Request to POST https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/richiestaElencoPec [DefaultWebClient]\n' +
          'Caused by: io.netty.handler.timeout.ReadTimeoutException: null',
      ),
      message(
        INFOCAMERE_CASES,
        'SEND_DOWNSTREAM_PNRICDDA_INF-AUT-INT-SER-ERR-500',
        `[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from POST ${INFOCAMERE_AUTHENTICATION}`,
      ),
      message(
        INFOCAMERE_CASES,
        'SEND_DOWNSTREAM_PNRICDDA_INF-CON-TIM',
        '[DOWNSTREAM] Service InfoCamere returned errors=finishConnect(..) failed: Connection timed out: ' +
          'icapis.infocamere.it/80.82.15.24:443',
      ),
      message(
        INFOCAMERE_CASES,
        'SEND_DOWNSTREAM_PNRICDDA_INF-CON-RES-BY-PEE',
        '[DOWNSTREAM] Service InfoCamere returned errors=recvAddress(..) failed: Connection reset by peer',
      ),
      message(
        ANPR_CASES,
        'SEND_DOWNSTREAM_PNRANPRDDA_ANP-NOT-FOU-404',
        `[DOWNSTREAM] Service ANPR returned errors=404 Not Found from POST ${ANPR_ENDPOINT}`,
      ),
      message(
        ANPR_CASES,
        'SEND_DOWNSTREAM_PNRANPRDDA_ANP-NOT-SPE-ERR',
        '[DOWNSTREAM] Service ANPR returned errors=<not specified>',
      ),
      message(
        ANPR_CASES,
        'SEND_DOWNSTREAM_PNRANPRDDA_ANP-BAD-REQ-400',
        `[DOWNSTREAM] Service ANPR returned errors=400 Bad Request from POST ${ANPR_ENDPOINT}`,
      ),
      ...[
        [
          'SEND_DOWNSTREAM_EDDA_EMD-SUB-MES-UNA-401',
          `submitMessage returned errors=401 Unauthorized from POST ${EMD_SEND_MESSAGE}`,
        ],
        [
          'SEND_DOWNSTREAM_EDDA_EMD-SUB-MES-INT-SER-ERR-500',
          `submitMessage returned errors=500 Internal Server Error from POST ${EMD_SEND_MESSAGE}`,
        ],
        [
          'SEND_DOWNSTREAM_EDDA_EMD-RET-PAY-NOT-FOU-OR-EXP-404',
          'getRetrieval returned errors=404 Not Found from GET https://api-emd.cstar.pagopa.it/emd/payment/' +
            'retrievalTokens/90ce77cc-c4e9-4928-bf77-ca235a391447-1783266544810',
        ],
        [
          'SEND_DOWNSTREAM_EDDA_EMD-SUB-MES-TOO-MAN-REQ-429-UAT',
          'submitMessage returned errors=429 Too Many Requests from POST ' +
            'https://api-emd.uat.cstar.pagopa.it/emd/message-core/sendMessage',
        ],
      ].map(([knownErrorCode = '', error = '']) =>
        message(EMD_CASES, knownErrorCode, `[DOWNSTREAM] Service ${error}`, 'query-pn-emd-integration'),
      ),
      ...[
        'nested exception is io.netty.handler.timeout.ReadTimeoutException',
        'io.netty.handler.timeout.ReadTimeoutException',
      ].map((error) =>
        message(
          ONE_TRUST_CASES,
          'SEND_DOWNSTREAM_PEROTDDA_ONE-REA-TIM',
          `[DOWNSTREAM] Service OneTrust returned errors=${error}`,
          'query-pn-external-registries',
        ),
      ),
      message(
        ONE_TRUST_CASES,
        'SEND_DOWNSTREAM_PEROTDDA_ONE-SER-UNA-503',
        '[DOWNSTREAM] Service OneTrust returned errors=503 Service Unavailable from GET ' +
          'https://app-de.onetrust.com/api/enterprise-policy/v1/privacynotices/' +
          '90ce77cc-c4e9-4928-bf77-ca235a391447/published-version',
        'query-pn-external-registries',
      ),
      message(
        SELFCARE_CASES,
        'SEND_DOWNSTREAM_PDVSPGDDA_SEL-SUB-ALT-NAM-MIS',
        '[DOWNSTREAM] Service SelfcarePG returned errors=No subject alternative DNS name matching ' +
          'api.selfcare.pagopa.it found',
        'query-pn-data-vault',
      ),
    ];
    for (const evidence of documented) {
      assert.strictEqual(matches(evidence), true, evidence.knownErrorCode);
    }
  });

  it('does not broaden the documented signatures to other services, statuses, endpoints or suffixes', () => {
    const lookalikes: ReadonlyArray<Evidence> = [
      message(
        EXTERNAL_CHANNEL_CASES,
        'SEND_SERVICE_WPECAA_DUP-EVE-ERR-CON',
        'sendPaperProgressStatusRequest timeout',
        'query-pn-external-channel',
      ),
      message(IPA_CASES, 'SEND_DOWNSTREAM_PNRIPADDA_IPA-SER-UNA-503', IPA_503.replace('Service IPA', 'Service INAD')),
      message(
        IPA_CASES,
        'SEND_DOWNSTREAM_PNRIPADDA_IPA-SER-UNA-503',
        IPA_503.replace('503 Service Unavailable', '502 Bad Gateway'),
      ),
      ...[
        'Service INAD returned errors=Connection prematurely closed BEFORE response',
        'Service IPA returned errors=Connection prematurely closed BEFORE responses',
        'Service IPA returned errors=Connection prematurely closed AFTER response',
      ].map((error) => message(IPA_CASES, 'SEND_DOWNSTREAM_PNRIPADDA_IPA-CON-PRE-CLO', `[DOWNSTREAM] ${error}`)),
      ...[
        '',
        '{"code":"OTHER_ERROR","appName":"wspa-lref"}',
        '{"code":"WSPA_ERR_00_OTHER","appName":"wspa-lref"}',
        '{"code":"WSPA_ERR_00","appName":"other-app"}',
      ].map((body) => ({
        cases: INFOCAMERE_CASES,
        knownErrorCode: 'SEND_DOWNSTREAM_PNRICDDA_INF-LEG-REP-INT-SER-ERR-500',
        stepId: NATIONAL_REGISTRIES,
        rows: [logRow({ message: `${INFOCAMERE_LEGAL_REPRESENTATIVE}TEST-CF;${body}` })],
      })),
      {
        // The documented code and appName must belong to the same event.
        cases: INFOCAMERE_CASES,
        knownErrorCode: 'SEND_DOWNSTREAM_PNRICDDA_INF-LEG-REP-INT-SER-ERR-500',
        stepId: NATIONAL_REGISTRIES,
        rows: [
          logRow({ message: `${INFOCAMERE_LEGAL_REPRESENTATIVE}TEST-CF;` }),
          logRow({ message: '{"code":"WSPA_ERR_00","appName":"wspa-lref"}' }),
        ],
      },
      message(
        EMD_CASES,
        'SEND_DOWNSTREAM_EDDA_EMD-SUB-MES-TOO-MAN-REQ-429-UAT',
        `[DOWNSTREAM] Service submitMessage returned errors=429 Too Many Requests from POST ${EMD_SEND_MESSAGE}`,
        'query-pn-emd-integration',
      ),
    ];
    for (const evidence of lookalikes) {
      assert.strictEqual(matches(evidence), false, `${evidence.knownErrorCode}: ${JSON.stringify(evidence.rows)}`);
    }
  });

  it('leaves undocumented IPA 404 and isolated InfoCamere 401 responses unknown', () => {
    for (const [cases, error] of [
      [IPA_CASES, 'Service IPA returned errors=404'],
      [IPA_CASES, 'Service IPA returned errors=404 Not Found from POST https://www.indicepa.gov.it/example'],
      [INFOCAMERE_CASES, `Service InfoCamere returned errors=401 Unauthorized from POST ${INFOCAMERE_AUTHENTICATION}`],
    ] as const) {
      const context = createTestContext({
        stepResults: { [NATIONAL_REGISTRIES]: [logRow({ '@message': `[DOWNSTREAM] ${error}` })] },
      });
      assert.deepStrictEqual(matchingKnownErrorCodes(cases, context), [], error);
    }
  });

  it('matches an empty SelfcarePG error only when its trace proves a read timeout', () => {
    for (const [trace, expected] of [
      [
        'reactor.netty.http.client.HttpClientConnect: The connection observed an error\n' +
          'io.netty.handler.timeout.ReadTimeoutException: null',
        true,
      ],
      ['Connection reset by peer', false],
    ] as const) {
      const context = createTestContext({
        vars: { dataVaultErrorMsg: '[DOWNSTREAM] Service SelfcarePG returned errors=' },
        stepResults: { 'query-pn-data-vault-trace': [logRow({ '@message': trace })] },
      });
      assert.strictEqual(
        caseMatches(knownErrorById(SELFCARE_CASES, 'SEND_DOWNSTREAM_PDVSPGDDA_SEL-REA-TIM-WIT-EMP-ERR'), context),
        expected,
      );
    }
  });

  it('resolves POSTEL only when the recovery step confirms every impacted batch as WORKED', () => {
    for (const [postelAllBatchesWorked, expected] of [
      ['true', true],
      ['false', false],
    ] as const) {
      const context = createTestContext({
        vars: { postelAllBatchesWorked },
        stepResults: {
          'query-pn-address-manager': [
            logRow({ '@message': '[DOWNSTREAM] Service POSTEL returned errors=503 Service Unavailable' }),
          ],
        },
      });
      assert.strictEqual(
        caseMatches(knownErrorById(POSTEL_CASES, 'SEND_DOWNSTREAM_PAMPOSTELDDA_POS-ALL-BAT-WOR-AFT-RET'), context),
        expected,
      );
    }
  });
});
