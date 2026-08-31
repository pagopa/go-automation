import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ConditionEvaluator,
  service,
  SEND_DOWNSTREAMS,
  type KnownCase,
  type RunbookContext,
  type ServiceRegistry,
} from '../framework.js';
import type { ResultField } from '@go-automation/go-common/aws';

import { KNOWN_CASES as EMD_DOWNSTREAM_CASES } from '../emd-downstream-detection-Alarm/knownCases.js';
import { SERVICE as EMD_DOWNSTREAM_SERVICE } from '../emd-downstream-detection-Alarm/knownServices.js';
import { buildRunbook as buildEmdDownstreamDetectionAlarmRunbook } from '../emd-downstream-detection-Alarm/runbook.js';
import { KNOWN_CASES as SELFCARE_DOWNSTREAM_CASES } from '../personal-data-vault-SelfcarePG-downstream-detection-Alarm/knownCases.js';
import { SERVICE as SELFCARE_DOWNSTREAM_SERVICE } from '../personal-data-vault-SelfcarePG-downstream-detection-Alarm/knownServices.js';
import { buildRunbook as buildPersonalDataVaultSelfcarePgDownstreamDetectionAlarmRunbook } from '../personal-data-vault-SelfcarePG-downstream-detection-Alarm/runbook.js';
import { KNOWN_CASES as POSTEL_DOWNSTREAM_CASES } from '../pn-address-manager-POSTEL-downstream-detection-Alarm/knownCases.js';
import { SERVICE as POSTEL_DOWNSTREAM_SERVICE } from '../pn-address-manager-POSTEL-downstream-detection-Alarm/knownServices.js';
import { buildRunbook as buildAddressManagerPostelDownstreamDetectionAlarmRunbook } from '../pn-address-manager-POSTEL-downstream-detection-Alarm/runbook.js';
import { KNOWN_CASES as ONE_TRUST_DOWNSTREAM_CASES } from '../pn-external-registries-OneTrust-downstream-detection-Alarm/knownCases.js';
import { SERVICE as ONE_TRUST_DOWNSTREAM_SERVICE } from '../pn-external-registries-OneTrust-downstream-detection-Alarm/knownServices.js';
import { buildRunbook as buildExternalRegistriesOneTrustDownstreamDetectionAlarmRunbook } from '../pn-external-registries-OneTrust-downstream-detection-Alarm/runbook.js';
import { KNOWN_CASES as ADE_DOWNSTREAM_CASES } from '../pn-national-registries-AdE-downstream-detection-Alarm/knownCases.js';
import { SERVICE as ADE_DOWNSTREAM_SERVICE } from '../pn-national-registries-AdE-downstream-detection-Alarm/knownServices.js';
import { buildRunbook as buildNationalRegistriesAdeDownstreamDetectionAlarmRunbook } from '../pn-national-registries-AdE-downstream-detection-Alarm/runbook.js';
import { KNOWN_CASES as ANPR_DOWNSTREAM_CASES } from '../pn-national-registries-ANPR-downstream-detection-Alarm/knownCases.js';
import { SERVICE as ANPR_DOWNSTREAM_SERVICE } from '../pn-national-registries-ANPR-downstream-detection-Alarm/knownServices.js';
import { buildRunbook as buildNationalRegistriesAnprDownstreamDetectionAlarmRunbook } from '../pn-national-registries-ANPR-downstream-detection-Alarm/runbook.js';
import { KNOWN_CASES as INFOCAMERE_DOWNSTREAM_CASES } from '../pn-national-registries-InfoCamere-downstream-detection-Alarm/knownCases.js';
import { SERVICE as INFOCAMERE_DOWNSTREAM_SERVICE } from '../pn-national-registries-InfoCamere-downstream-detection-Alarm/knownServices.js';
import { buildRunbook as buildNationalRegistriesInfoCamereDownstreamDetectionAlarmRunbook } from '../pn-national-registries-InfoCamere-downstream-detection-Alarm/runbook.js';
import { KNOWN_CASES as INAD_DOWNSTREAM_CASES } from '../pn-national-registries-INAD-downstream-detection-Alarm/knownCases.js';
import { SERVICE as INAD_DOWNSTREAM_SERVICE } from '../pn-national-registries-INAD-downstream-detection-Alarm/knownServices.js';
import { buildRunbook as buildNationalRegistriesInadDownstreamDetectionAlarmRunbook } from '../pn-national-registries-INAD-downstream-detection-Alarm/runbook.js';
import { KNOWN_CASES as IPA_DOWNSTREAM_CASES } from '../pn-national-registries-IPA-downstream-detection-Alarm/knownCases.js';
import { SERVICE as IPA_DOWNSTREAM_SERVICE } from '../pn-national-registries-IPA-downstream-detection-Alarm/knownServices.js';
import { buildRunbook as buildNationalRegistriesIpaDownstreamDetectionAlarmRunbook } from '../pn-national-registries-IPA-downstream-detection-Alarm/runbook.js';
import { KNOWN_CASES as EXTERNAL_CHANNEL_CASES } from '../workday-pn-external-channel-alb-alarm/knownCases.js';
import { buildRunbook as buildWorkdayPnExternalChannelAlbAlarmRunbook } from '../workday-pn-external-channel-alb-alarm/runbook.js';

function ctx(args: {
  readonly stepResults?: ReadonlyArray<readonly [string, unknown]>;
  readonly vars?: ReadonlyArray<readonly [string, string]>;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-06-09T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(args.stepResults ?? []),
    vars: new Map(args.vars ?? []),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function knownCaseById(cases: ReadonlyArray<KnownCase>, id: string): KnownCase {
  const knownCase = cases.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined);
  return knownCase;
}

function cwRow(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

describe('service runbook known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('matches duplicated external-channel paper progress events', () => {
    const knownCase = knownCaseById(EXTERNAL_CHANNEL_CASES, 'duplicated-event-400-02');

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          stepResults: [
            [
              'query-pn-external-channel',
              [
                'sendPaperProgressStatusRequest syntax/semantic errors : result code = \'400.02\' : result description = \'Errore di validazione regole semantiche\' : specific errors identified = [DUPLICATED_EVENT] ERR_CONS - {"errorList":[{"error":"[ERR_CONS_DUPLICATED_EVENT]"}]}',
              ],
            ],
          ],
        }),
      ),
      true,
    );
  });

  it('matches ERR_CONS duplicated event logs without the 400.02 text', () => {
    const knownCase = knownCaseById(EXTERNAL_CHANNEL_CASES, 'duplicated-event-err-cons');

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          stepResults: [
            [
              'query-pn-external-channel',
              [
                cwRow({
                  '@timestamp': '2026-06-01T05:04:13.372Z',
                  level: 'ERROR',
                  '@message':
                    '{"message":"ERR_CONS - {\\"request\\":[{\\"requestId\\":\\"PREPARE_ANALOG_DOMICILE.IUN_VGYH-HDTK-NEWA-202603-W-1\\"}], \\"errorList\\":[{\\"error\\": \\"[ERR_CONS_DUPLICATED_EVENT]\\", \\"description\\": \\"The request has duplicated events\\"}]}","trace_id":"6a1d12cde853a9726be9c7c20da54682"}',
                  trace_id: '6a1d12cde853a9726be9c7c20da54682',
                }),
              ],
            ],
          ],
        }),
      ),
      true,
    );
  });

  it('does not match unrelated external-channel errors', () => {
    const knownCase = knownCaseById(EXTERNAL_CHANNEL_CASES, 'duplicated-event-err-cons');

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          stepResults: [['query-pn-external-channel', ['sendPaperProgressStatusRequest timeout']]],
        }),
      ),
      false,
    );
  });

  it('matches the documented IPA 503 service-unavailable error', () => {
    const knownCase = knownCaseById(IPA_DOWNSTREAM_CASES, 'ipa-service-unavailable-503');
    const message =
      '[DOWNSTREAM] Service IPA returned errors=503 Service Unavailable from POST ' +
      'https://www.indicepa.gov.it/ws/WS23DOMDIGCFServices/api/WS23_DOM_DIG_CF';

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          stepResults: [
            [
              'query-pn-national-registries',
              [cwRow({ '@timestamp': '2025-12-02T14:59:00.000Z', level: 'ERROR', message, '@message': message })],
            ],
          ],
        }),
      ),
      true,
    );
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.IPA]);
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'COMPLETED');
    assert.deepStrictEqual(knownCase.analysis?.finalActions, [
      'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto',
    ]);
  });

  it('matches IPA 404 responses as a completed known case without operational action', () => {
    const knownCase = knownCaseById(IPA_DOWNSTREAM_CASES, 'ipa-known-response-404');

    for (const message of [
      '[DOWNSTREAM] Service IPA returned errors=404',
      '[DOWNSTREAM] Service IPA returned errors=404 Not Found from POST https://www.indicepa.gov.it/example',
    ]) {
      assert.strictEqual(
        evaluator.evaluate(
          knownCase.condition,
          ctx({ stepResults: [['query-pn-national-registries', [cwRow({ '@message': message })]]] }),
        ),
        true,
      );
    }
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.IPA]);
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'COMPLETED');
    assert.strictEqual(knownCase.analysis?.analysisType, 'ANALYZABLE');
    assert.deepStrictEqual(knownCase.analysis?.finalActions, [
      'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto',
    ]);
  });

  it('does not treat INAD or a different IPA status as the documented case', () => {
    const knownCase = knownCaseById(IPA_DOWNSTREAM_CASES, 'ipa-service-unavailable-503');

    for (const message of [
      '[DOWNSTREAM] Service INAD returned errors=503 Service Unavailable from POST https://www.indicepa.gov.it/ws/WS23DOMDIGCFServices/api/WS23_DOM_DIG_CF',
      '[DOWNSTREAM] Service IPA returned errors=502 Bad Gateway from POST https://www.indicepa.gov.it/ws/WS23DOMDIGCFServices/api/WS23_DOM_DIG_CF',
    ]) {
      assert.strictEqual(
        evaluator.evaluate(
          knownCase.condition,
          ctx({ stepResults: [['query-pn-national-registries', [cwRow({ '@message': message })]]] }),
        ),
        false,
      );
    }
  });

  it('uses the canonical IPA query and includes HTTP 404', () => {
    assert.strictEqual(
      IPA_DOWNSTREAM_SERVICE.queryOverride,
      service.buildDownstreamDetectionQuery({
        downstreamName: SEND_DOWNSTREAMS.IPA,
      }),
    );
    assert.doesNotMatch(IPA_DOWNSTREAM_SERVICE.queryOverride ?? '', /not like.*404/);
    assert.doesNotMatch(IPA_DOWNSTREAM_SERVICE.queryOverride ?? '', /INAD/);
  });

  it('matches AdE HTTP 500 and both timeout variants, mapping the specialized downstream', () => {
    const internalServerErrorCase = knownCaseById(
      ADE_DOWNSTREAM_CASES,
      'ade-legal-representative-internal-server-error-500',
    );
    const legalRepresentativeCase = knownCaseById(ADE_DOWNSTREAM_CASES, 'ade-legal-representative-read-timeout');
    const genericCase = knownCaseById(ADE_DOWNSTREAM_CASES, 'ade-read-timeout');
    const internalServerErrorMessage =
      '[DOWNSTREAM] Service AdE returned errors=500 Internal Server Error from POST ' +
      'https://gatewaywebservices.agenziaentrate.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService';
    const legalRepresentativeMessage =
      '[DOWNSTREAM] Service AdE returned errors=<not specified>\n' +
      'Request to POST https://gatewaywebservices.agenziaentrate.it/SPCBooleanoRappWS/' +
      'VerificaRappresentanteEnteService failed\n' +
      'io.netty.handler.timeout.ReadTimeoutException';
    const genericMessage =
      '[DOWNSTREAM] Service AdE returned errors=nested exception is io.netty.handler.timeout.ReadTimeoutException';

    assert.strictEqual(
      evaluator.evaluate(
        internalServerErrorCase.condition,
        ctx({ stepResults: [['query-pn-national-registries', [cwRow({ '@message': internalServerErrorMessage })]]] }),
      ),
      true,
    );
    assert.deepStrictEqual(internalServerErrorCase.analysis?.downstreams, [
      SEND_DOWNSTREAMS.VERIFICA_LEGALE_RAPPRESENTANTE_ADE,
    ]);
    assert.strictEqual(
      evaluator.evaluate(
        legalRepresentativeCase.condition,
        ctx({ stepResults: [['query-pn-national-registries', [cwRow({ '@message': legalRepresentativeMessage })]]] }),
      ),
      true,
    );
    assert.deepStrictEqual(legalRepresentativeCase.analysis?.downstreams, [
      SEND_DOWNSTREAMS.VERIFICA_LEGALE_RAPPRESENTANTE_ADE,
    ]);
    assert.strictEqual(
      evaluator.evaluate(
        genericCase.condition,
        ctx({ stepResults: [['query-pn-national-registries', [cwRow({ '@message': genericMessage })]]] }),
      ),
      true,
    );
    assert.deepStrictEqual(genericCase.analysis?.downstreams, [SEND_DOWNSTREAMS.ADE]);
  });

  it('matches INAD 503 and excludes HTTP 404 from the canonical query', () => {
    const knownCase = knownCaseById(INAD_DOWNSTREAM_CASES, 'inad-service-unavailable-503');
    const message = '[DOWNSTREAM] Service INAD returned errors=503 Service Unavailable from GET https://inad.gov.it';

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({ stepResults: [['query-pn-national-registries', [cwRow({ '@message': message })]]] }),
      ),
      true,
    );
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.INAD]);
    assert.strictEqual(
      INAD_DOWNSTREAM_SERVICE.queryOverride,
      service.buildDownstreamDetectionQuery({
        downstreamName: SEND_DOWNSTREAMS.INAD,
        excludedStatusCodes: [404],
      }),
    );
    assert.match(INAD_DOWNSTREAM_SERVICE.queryOverride ?? '', /not like.*INAD.*404/);
  });

  it('matches the additional transient INAD failures observed in production', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      [
        'inad-digital-domicile-internal-server-error-500',
        '[DOWNSTREAM] Service INAD returned errors=500 Internal Server Error from GET ' +
          'https://api.inad.gov.it/rest/inad/v1/domiciliodigitale/extract/RKASLN96R24C219Z',
      ],
      [
        'inad-connect-timeout',
        '[DOWNSTREAM] Service INAD returned errors=connection timed out after 3000 ms: ' +
          'api.inad.gov.it/80.82.15.226:443',
      ],
      [
        'inad-connection-reset-by-peer',
        '[DOWNSTREAM] Service INAD returned errors=recvAddress(..) failed: Connection reset by peer',
      ],
    ];

    for (const [id, message] of cases) {
      const knownCase = knownCaseById(INAD_DOWNSTREAM_CASES, id);
      assert.strictEqual(
        evaluator.evaluate(
          knownCase.condition,
          ctx({ stepResults: [['query-pn-national-registries', [cwRow({ '@message': message })]]] }),
        ),
        true,
      );
      assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.INAD]);
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'COMPLETED');
    }
  });

  it('matches every documented ANPR response and maps the ANPR downstream', () => {
    const endpoint =
      'https://modipa.anpr.interno.it/govway/rest/in/MinInternoPortaANPR-PDND/' +
      'C001-servizioNotifica/v1/anpr-service-e002';
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['anpr-not-found-404', `[DOWNSTREAM] Service ANPR returned errors=404 Not Found from POST ${endpoint}`],
      ['anpr-not-specified-error', '[DOWNSTREAM] Service ANPR returned errors=<not specified>'],
      ['anpr-bad-request-400', `[DOWNSTREAM] Service ANPR returned errors=400 Bad Request from POST ${endpoint}`],
    ];

    for (const [id, message] of cases) {
      const knownCase = knownCaseById(ANPR_DOWNSTREAM_CASES, id);
      assert.strictEqual(
        evaluator.evaluate(
          knownCase.condition,
          ctx({ stepResults: [['query-pn-national-registries', [cwRow({ '@message': message })]]] }),
        ),
        true,
      );
      assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.ANPR]);
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'COMPLETED');
    }
  });

  it('matches every documented EMD response and maps EMD (Multicanalità)', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      [
        'emd-submit-message-unauthorized-401',
        '[DOWNSTREAM] Service submitMessage returned errors=401 Unauthorized from POST ' +
          'https://api-emd.cstar.pagopa.it/emd/message-core/sendMessage',
      ],
      [
        'emd-submit-message-internal-server-error-500',
        '[DOWNSTREAM] Service submitMessage returned errors=500 Internal Server Error from POST ' +
          'https://api-emd.cstar.pagopa.it/emd/message-core/sendMessage',
      ],
      [
        'emd-retrieval-payload-not-found-or-expired-404',
        '[DOWNSTREAM] Service getRetrieval returned errors=404 Not Found from GET ' +
          'https://api-emd.cstar.pagopa.it/emd/payment/retrievalTokens/' +
          '90ce77cc-c4e9-4928-bf77-ca235a391447-1783266544810',
      ],
      [
        'emd-submit-message-too-many-requests-429-uat',
        '[DOWNSTREAM] Service submitMessage returned errors=429 Too Many Requests from POST ' +
          'https://api-emd.uat.cstar.pagopa.it/emd/message-core/sendMessage',
      ],
    ];

    for (const [id, message] of cases) {
      const knownCase = knownCaseById(EMD_DOWNSTREAM_CASES, id);
      assert.strictEqual(
        evaluator.evaluate(
          knownCase.condition,
          ctx({ stepResults: [['query-pn-emd-integration', [cwRow({ '@message': message })]]] }),
        ),
        true,
      );
      assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.EMD_MULTICANALITA]);
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'COMPLETED');
    }

    assert.strictEqual(
      knownCaseById(EMD_DOWNSTREAM_CASES, 'emd-submit-message-unauthorized-401').analysis?.links?.length,
      1,
    );
    assert.strictEqual(
      knownCaseById(EMD_DOWNSTREAM_CASES, 'emd-retrieval-payload-not-found-or-expired-404').analysis?.links?.length,
      3,
    );
  });

  it('does not apply the EMD UAT 429 resolution to the production endpoint', () => {
    const knownCase = knownCaseById(EMD_DOWNSTREAM_CASES, 'emd-submit-message-too-many-requests-429-uat');
    const productionMessage =
      '[DOWNSTREAM] Service submitMessage returned errors=429 Too Many Requests from POST ' +
      'https://api-emd.cstar.pagopa.it/emd/message-core/sendMessage';

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({ stepResults: [['query-pn-emd-integration', [cwRow({ '@message': productionMessage })]]] }),
      ),
      false,
    );
  });

  it('matches every documented OneTrust response and the observed direct timeout variant', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      [
        'onetrust-read-timeout',
        '[DOWNSTREAM] Service OneTrust returned errors=nested exception is ' +
          'io.netty.handler.timeout.ReadTimeoutException',
      ],
      [
        'onetrust-service-unavailable-503',
        '[DOWNSTREAM] Service OneTrust returned errors=503 Service Unavailable from GET ' +
          'https://app-de.onetrust.com/api/enterprise-policy/v1/privacynotices/' +
          '90ce77cc-c4e9-4928-bf77-ca235a391447/published-version',
      ],
    ];

    for (const [id, message] of cases) {
      const knownCase = knownCaseById(ONE_TRUST_DOWNSTREAM_CASES, id);
      assert.strictEqual(
        evaluator.evaluate(
          knownCase.condition,
          ctx({ stepResults: [['query-pn-external-registries', [cwRow({ '@message': message })]]] }),
        ),
        true,
      );
      assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.ONE_TRUST]);
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'COMPLETED');
    }

    const timeoutCase = knownCaseById(ONE_TRUST_DOWNSTREAM_CASES, 'onetrust-read-timeout');
    const directTimeoutMessage =
      '[DOWNSTREAM] Service OneTrust returned errors=io.netty.handler.timeout.ReadTimeoutException';
    assert.strictEqual(
      evaluator.evaluate(
        timeoutCase.condition,
        ctx({ stepResults: [['query-pn-external-registries', [cwRow({ '@message': directTimeoutMessage })]]] }),
      ),
      true,
    );
  });

  it('matches the documented InfoCamere richiestaElencoPec timeout', () => {
    const knownCase = knownCaseById(INFOCAMERE_DOWNSTREAM_CASES, 'infocamere-richiesta-elenco-pec-read-timeout');
    const message =
      '[DOWNSTREAM] Service InfoCamere returned errors=Unknown error ' +
      'org.springframework.web.reactive.function.client.WebClientRequestException: null\n' +
      'Request to POST https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/richiestaElencoPec [DefaultWebClient]\n' +
      'Caused by: io.netty.handler.timeout.ReadTimeoutException: null';

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({ stepResults: [['query-pn-national-registries', [cwRow({ '@message': message })]]] }),
      ),
      true,
    );
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.RICHIESTA_ELENCO_PEC_INFOCAMERE]);
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'COMPLETED');
  });

  it('matches the additional InfoCamere failures observed in production', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      [
        'infocamere-authentication-internal-server-error-500',
        '[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from POST ' +
          'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/authentication',
      ],
      [
        'infocamere-connect-timeout',
        '[DOWNSTREAM] Service InfoCamere returned errors=finishConnect(..) failed: Connection timed out: ' +
          'icapis.infocamere.it/80.82.15.24:443',
      ],
      [
        'infocamere-connection-reset-by-peer',
        '[DOWNSTREAM] Service InfoCamere returned errors=recvAddress(..) failed: Connection reset by peer',
      ],
    ];

    for (const [id, message] of cases) {
      const knownCase = knownCaseById(INFOCAMERE_DOWNSTREAM_CASES, id);
      assert.strictEqual(
        evaluator.evaluate(
          knownCase.condition,
          ctx({ stepResults: [['query-pn-national-registries', [cwRow({ '@message': message })]]] }),
        ),
        true,
      );
      assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.INFOCAMERE]);
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'COMPLETED');
    }
  });

  it('does not classify an isolated InfoCamere 401 as a known transient failure', () => {
    const message =
      '[DOWNSTREAM] Service InfoCamere returned errors=401 Unauthorized from POST ' +
      'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/authentication';
    const context = ctx({
      stepResults: [['query-pn-national-registries', [cwRow({ '@message': message })]]],
    });

    assert.strictEqual(
      INFOCAMERE_DOWNSTREAM_CASES.some(({ condition }) => evaluator.evaluate(condition, context)),
      false,
    );
  });

  it('matches the documented SelfcarePG certificate failure and maps it to SelfCare', () => {
    const knownCase = knownCaseById(SELFCARE_DOWNSTREAM_CASES, 'selfcarepg-subject-alternative-name-mismatch');
    const message =
      '[DOWNSTREAM] Service SelfcarePG returned errors=No subject alternative DNS name matching ' +
      'api.selfcare.pagopa.it found';

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({ stepResults: [['query-pn-data-vault', [cwRow({ '@message': message })]]] }),
      ),
      true,
    );
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.SELFCARE]);
    assert.strictEqual(knownCase.analysis?.links?.[0]?.type, 'SLACK');
  });

  it('matches an empty SelfcarePG error only when its trace proves a read timeout', () => {
    const knownCase = knownCaseById(SELFCARE_DOWNSTREAM_CASES, 'selfcarepg-read-timeout-with-empty-error');
    const emptyError = '[DOWNSTREAM] Service SelfcarePG returned errors=';
    const timeoutTrace =
      'reactor.netty.http.client.HttpClientConnect: The connection observed an error\n' +
      'io.netty.handler.timeout.ReadTimeoutException: null';

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          vars: [['dataVaultErrorMsg', emptyError]],
          stepResults: [['query-pn-data-vault-trace', [cwRow({ '@message': timeoutTrace })]]],
        }),
      ),
      true,
    );
    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          vars: [['dataVaultErrorMsg', emptyError]],
          stepResults: [['query-pn-data-vault-trace', [cwRow({ '@message': 'Connection reset by peer' })]]],
        }),
      ),
      false,
    );
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.SELFCARE]);
  });

  it('resolves POSTEL only when the recovery step confirms every impacted batch as WORKED', () => {
    const knownCase = knownCaseById(POSTEL_DOWNSTREAM_CASES, 'postel-all-batches-worked-after-retry');
    const stepResults: ReadonlyArray<readonly [string, unknown]> = [
      [
        'query-pn-address-manager',
        [cwRow({ '@message': '[DOWNSTREAM] Service POSTEL returned errors=503 Service Unavailable' })],
      ],
    ];

    assert.strictEqual(
      evaluator.evaluate(knownCase.condition, ctx({ stepResults, vars: [['postelAllBatchesWorked', 'true']] })),
      true,
    );
    assert.strictEqual(
      evaluator.evaluate(knownCase.condition, ctx({ stepResults, vars: [['postelAllBatchesWorked', 'false']] })),
      false,
    );
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.CONSOLIDATORE_POSTALE]);
  });

  it('uses the canonical downstream query for ANPR, InfoCamere, AdE, OneTrust, POSTEL and SelfcarePG', () => {
    assert.strictEqual(
      ANPR_DOWNSTREAM_SERVICE.queryOverride,
      service.buildDownstreamDetectionQuery({ downstreamName: SEND_DOWNSTREAMS.ANPR }),
    );
    assert.strictEqual(
      INFOCAMERE_DOWNSTREAM_SERVICE.queryOverride,
      service.buildDownstreamDetectionQuery({ downstreamName: SEND_DOWNSTREAMS.INFOCAMERE }),
    );
    assert.strictEqual(
      ADE_DOWNSTREAM_SERVICE.queryOverride,
      service.buildDownstreamDetectionQuery({ downstreamName: SEND_DOWNSTREAMS.ADE }),
    );
    assert.strictEqual(
      ONE_TRUST_DOWNSTREAM_SERVICE.queryOverride,
      service.buildDownstreamDetectionQuery({ downstreamName: 'OneTrust' }),
    );
    assert.strictEqual(
      POSTEL_DOWNSTREAM_SERVICE.queryOverride,
      service.buildDownstreamDetectionQuery({ downstreamName: 'POSTEL' }),
    );
    assert.strictEqual(
      SELFCARE_DOWNSTREAM_SERVICE.queryOverride,
      service.buildDownstreamDetectionQuery({ downstreamName: 'SelfcarePG' }),
    );
  });

  it('uses the generic canonical downstream query for the cross-operation EMD alarm', () => {
    assert.strictEqual(
      EMD_DOWNSTREAM_SERVICE.queryOverride,
      service.buildDownstreamDetectionQuery({ matchAnyService: true }),
    );
    assert.match(EMD_DOWNSTREAM_SERVICE.queryOverride ?? '', /level = 'ERROR'/);
    assert.doesNotMatch(EMD_DOWNSTREAM_SERVICE.queryOverride ?? '', /submitMessage|getRetrieval/);
  });

  it('builds the service runbooks without validation errors', () => {
    assert.doesNotThrow(() => buildWorkdayPnExternalChannelAlbAlarmRunbook());
    for (const runbook of [
      buildExternalRegistriesOneTrustDownstreamDetectionAlarmRunbook(),
      buildNationalRegistriesAnprDownstreamDetectionAlarmRunbook(),
      buildNationalRegistriesInfoCamereDownstreamDetectionAlarmRunbook(),
      buildNationalRegistriesInadDownstreamDetectionAlarmRunbook(),
      buildNationalRegistriesIpaDownstreamDetectionAlarmRunbook(),
      buildAddressManagerPostelDownstreamDetectionAlarmRunbook(),
      buildPersonalDataVaultSelfcarePgDownstreamDetectionAlarmRunbook(),
    ]) {
      assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 10, afterMinutes: 5 });
    }
    assert.deepStrictEqual(buildNationalRegistriesAdeDownstreamDetectionAlarmRunbook().occurrenceTimeWindow, {
      beforeMinutes: 30,
      afterMinutes: 5,
    });
    assert.deepStrictEqual(buildEmdDownstreamDetectionAlarmRunbook().occurrenceTimeWindow, {
      beforeMinutes: 30,
      afterMinutes: 5,
    });
    assert.ok(
      buildAddressManagerPostelDownstreamDetectionAlarmRunbook().steps.some(
        ({ step }) => step.id === 'verify-postel-batches',
      ),
    );
  });
});
