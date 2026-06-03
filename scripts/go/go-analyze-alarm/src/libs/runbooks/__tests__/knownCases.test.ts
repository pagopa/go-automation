import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ConditionEvaluator, type RunbookContext, type ServiceRegistry } from '@go-automation/go-runbook';

import { KNOWN_CASES as NATIONAL_REGISTRIES_PNPG_KNOWN_CASES } from '../pn-national-registries-PNPG-ApiGwAlarm/knownCases.js';

function contextWithVars(
  vars: Record<string, string>,
  stepResults: ReadonlyArray<readonly [string, unknown]> = [],
): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-06-03T13:11:56.000Z'),
    stepResults: new Map(stepResults),
    vars: new Map(Object.entries(vars)),
    params: new Map(),
    logs: [],
    services: {} as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('runbook known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('matches national-registries PNPG 504 endpoint timeout on InfoCamere legal-institutions', () => {
    const knownCase = NATIONAL_REGISTRIES_PNPG_KNOWN_CASES.find(
      (item) => item.id === 'apigw-504-infocamere-inad-timeout',
    );

    assert.ok(knownCase);
    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        contextWithVars({
          apiGwStatusCode: '504',
          apiGwErrorMessage: 'Endpoint request timed out',
          apiGwPath: '/national-registries-private/infocamere/legal-institutions',
          nationalRegistriesLogCount: '0',
        }),
      ),
      true,
    );
  });

  it('matches national-registries PNPG InfoCamere authentication downstream 500', () => {
    const knownCase = NATIONAL_REGISTRIES_PNPG_KNOWN_CASES.find(
      (item) => item.id === 'downstream-infocamere-500-authentication',
    );

    assert.ok(knownCase);
    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        contextWithVars({}, [
          [
            'query-pn-national-registries',
            [
              {
                message:
                  '[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from POST https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/authentication?client_id=client',
              },
            ],
          ],
        ]),
      ),
      true,
    );
  });

  it('matches national-registries PNPG AdE read timeout on legal representative verification', () => {
    const knownCase = NATIONAL_REGISTRIES_PNPG_KNOWN_CASES.find(
      (item) => item.id === 'downstream-ade-read-timeout-verifica-legale-rappresentante',
    );

    assert.ok(knownCase);
    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        contextWithVars(
          {
            apiGwStatusCode: '504',
            apiGwErrorMessage: 'Endpoint request timed out',
            apiGwPath: '/national-registries-private/agenzia-entrate/legal',
            nationalRegistriesNextUrlTarget: 'AdE',
          },
          [
            [
              'query-pn-national-registries',
              [
                {
                  message: '[DOWNSTREAM] Service AdE returned errors=<not specified>',
                  stack_trace:
                    'Request to POST https://gatewaywebservices.agenziaentrate.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService [DefaultWebClient]\nCaused by: io.netty.handler.timeout.ReadTimeoutException: null',
                },
              ],
            ],
          ],
        ),
      ),
      true,
    );
  });
});
