import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ConditionEvaluator,
  type KnownCase,
  type RunbookContext,
  type ServiceRegistry,
} from '@go-automation/go-runbook';

import { KNOWN_CASES as NATIONAL_REGISTRIES_PNPG_CASES } from '../pn-national-registries-PNPG-ApiGwAlarm/knownCases.js';

function ctx(args: {
  readonly vars?: Record<string, string>;
  readonly stepResults?: ReadonlyArray<readonly [string, unknown]>;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-06-03T09:21:00.000Z'),
    stepResults: new Map<string, unknown>(args.stepResults ?? []),
    vars: new Map(Object.entries(args.vars ?? {})),
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

describe('API Gateway runbook known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('matches the AdE legal API Gateway timeout when service logs are absent', () => {
    const knownCase = knownCaseById(NATIONAL_REGISTRIES_PNPG_CASES, 'apigw-504-ade-legal-timeout-no-service-logs');

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          vars: {
            apiGwStatusCode: '504',
            nationalRegistriesLogCount: '0',
            apiGwErrorMessage: 'Endpoint request timed out',
            apiGwHttpMethod: 'POST',
            apiGwPath: '/national-registries-private/agenzia-entrate/legal',
          },
        }),
      ),
      true,
    );
  });

  it('does not match the AdE no-log timeout case for InfoCamere paths', () => {
    const knownCase = knownCaseById(NATIONAL_REGISTRIES_PNPG_CASES, 'apigw-504-ade-legal-timeout-no-service-logs');

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          vars: {
            apiGwStatusCode: '504',
            nationalRegistriesLogCount: '0',
            apiGwErrorMessage: 'Endpoint request timed out',
            apiGwHttpMethod: 'POST',
            apiGwPath: '/national-registries-private/infocamere/legal-institutions',
          },
        }),
      ),
      false,
    );
  });

  it('matches InfoCamere authentication 500 when the log URL has no query string', () => {
    const knownCase = knownCaseById(NATIONAL_REGISTRIES_PNPG_CASES, 'downstream-infocamere-500-authentication');

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          stepResults: [
            [
              'query-pn-national-registries',
              [
                '[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from POST https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/authentication',
              ],
            ],
          ],
        }),
      ),
      true,
    );
  });

  it('keeps matching InfoCamere authentication 500 when the log URL has client_id', () => {
    const knownCase = knownCaseById(NATIONAL_REGISTRIES_PNPG_CASES, 'downstream-infocamere-500-authentication');

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        ctx({
          stepResults: [
            [
              'query-pn-national-registries',
              [
                '[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from POST https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/authentication?client_id=pn',
              ],
            ],
          ],
        }),
      ),
      true,
    );
  });
});
