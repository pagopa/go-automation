import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunbookContext, StepResult } from '../../../engine/index.js';
import { apigw, createTestServiceRegistry, INTEROP_ENVIRONMENTS, service } from '../../../toolkits/interop/index.js';
import { INTEROP_MANIFEST } from '../manifest.js';

/** API Gateway of each environment, for the runbooks of the API Gateway family. */
const API_GW_IDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'interop-selfcare-1.0-apigw-5xx': { prod: 'tf9isbi4pi', att: '5sfghk09qb', test: 'an24tfmqw3' },
  'interop-api-v2-apigw-5xx': { prod: 'rudgz28tel', att: 'c786nyh6f4', test: 'jrafz6h9c9' },
  'interop-auth-server-apigw-4xx': { prod: 'ffmbmcmreh', att: '70ar087an0', test: 'q9ocrukty2' },
  'interop-auth-server-apigw-5xx': { prod: 'ffmbmcmreh', att: '70ar087an0', test: 'q9ocrukty2' },
};

/** Names that look like a sibling of a registered alarm but must not resolve. */
const LOOKALIKE_NAMES: Readonly<Record<string, ReadonlyArray<string>>> = {
  'interop-auth-server-apigw-4xx': ['interop-auth-server-prod-apigw-4xx-low-requests'],
  'interop-auth-server-apigw-5xx': ['interop-auth-server-test-apigw-5xx-low-requests'],
  'k8s-interop-public-catalog-astro-frontend-errors': ['k8s-interop-public-catalog-astro-frontend-errors-prod'],
  'k8s-interop-public-catalog-strapi-errors': ['k8s-interop-public-catalog-strapi-errors-prod'],
  'k8s-interop-be-attribute-registry-readmodel-writer-sql-errors': [
    'k8s-interop-be-attribute-registry-readmodel-writer-sqlr-errors-prod',
  ],
  'k8s-interop-be-async-token-generation-readmodel-checker-errors': [
    'k8s-interop-be-async-token-generation-readmodel-checker-errors-prod',
  ],
  'k8s-interop-be-m2m-event-dispatcher-errors-prod': ['k8s-interop-be-m2m-event-dispatcher-errors-att'],
};

/** Runbooks without an alarm-context resolution step: their single alarm is hard-wired. */
const WITHOUT_CONTEXT_RESOLUTION: ReadonlySet<string> = new Set(['interop-att-eservices-att-apigw-4xx']);

type Registration = (typeof INTEROP_MANIFEST)[number];

/** Service whose logs the runbook reads, as published in its runbook context. */
function serviceName(registration: Registration): string | undefined {
  const { runbookContext } = registration.build();
  if (service.isServiceRunbookContext(runbookContext)) return runbookContext.service.name;
  return apigw.isApiGwRunbookContext(runbookContext) ? runbookContext.services[0]?.name : undefined;
}

async function resolve(registration: Registration, alarmName: string): Promise<StepResult> {
  const step = registration.build().steps[0]?.step;
  assert.ok(step !== undefined);
  const context: RunbookContext = {
    executionId: 'interop-inventory-test',
    startedAt: new Date('2026-10-01T10:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map([['alarmName', alarmName]]),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
  return step.execute(context);
}

describe('INTEROP inventory', () => {
  for (const registration of INTEROP_MANIFEST) {
    if (WITHOUT_CONTEXT_RESOLUTION.has(registration.key)) continue;

    it(`${registration.key} resolves each registered alarm to its own environment and rejects foreign names`, async () => {
      for (const alarmName of registration.alarmNames) {
        const { success, vars } = await resolve(registration, alarmName);
        assert.ok(success, alarmName);
        const environment = vars?.['interopEnvironment'] ?? '';
        assert.ok(
          INTEROP_ENVIRONMENTS.some((candidate) => candidate === environment),
          alarmName,
        );
        assert.match(alarmName, new RegExp(`-${environment}(-|$)`, 'u'));
        assert.strictEqual(vars?.['interopRunbookKey'], registration.key);
        assert.strictEqual(vars?.['interopPodApp'], serviceName(registration));
        assert.strictEqual(vars?.['interopLogGroup'], `/aws/eks/interop-eks-cluster-${environment}/application`);
        const apiGwIds = API_GW_IDS[registration.key];
        if (apiGwIds !== undefined) {
          assert.strictEqual(vars?.['interopApiGwId'], apiGwIds[environment], alarmName);
          assert.strictEqual(vars?.['interopApiGwLogGroup'], `amazon-apigateway-interop-access-logs-${environment}`);
        }
      }

      const sibling = INTEROP_MANIFEST.find((candidate) => candidate.key !== registration.key);
      const foreign = [
        `${registration.alarmNames[0]}-bogus`,
        registration.key,
        ...(sibling === undefined ? [] : sibling.alarmNames),
        ...(LOOKALIKE_NAMES[registration.key] ?? []),
      ];
      for (const alarmName of foreign) {
        if (registration.alarmNames.includes(alarmName)) continue;
        const { success, error } = await resolve(registration, alarmName);
        assert.strictEqual(success, false, alarmName);
        assert.match(error ?? '', /Unsupported INTEROP alarm name/u);
      }
    });
  }

  it('declares unique case ids and priorities, ranking open cases above completed ones', () => {
    for (const registration of INTEROP_MANIFEST) {
      const { knownCases } = registration.build();
      assert.strictEqual(new Set(knownCases.map(({ id }) => id)).size, knownCases.length, registration.key);
      assert.strictEqual(new Set(knownCases.map(({ priority }) => priority)).size, knownCases.length, registration.key);
      const open = knownCases.filter(({ analysis }) => analysis?.proposedStatus === 'IN_PROGRESS');
      const completed = knownCases.filter(({ analysis }) => analysis?.proposedStatus === 'COMPLETED');
      for (const openCase of open) {
        for (const completedCase of completed) {
          assert.ok(openCase.priority > completedCase.priority, `${registration.key}: ${openCase.id}`);
        }
      }
    }
  });
});
