import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DecideNextStep } from '../DecideNextStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const SERVICES = new Set(['pn-user-attributes', 'pn-data-vault', 'pn-external-registries']);
const PREFIXES: Readonly<Record<string, string>> = {
  'pn-user-attributes': 'userAttributes',
  'pn-data-vault': 'dataVault',
  'pn-external-registries': 'externalRegistries',
};
const SWAP_TRACE = '1-3d472be7-2977635208a92722b97b5e24';

/** A decision case: the service deciding, its vars, the expected flow and the vars it must write. */
interface DecisionCase {
  readonly name: string;
  readonly service: string;
  readonly vars: Readonly<Record<string, string>>;
  readonly next: unknown;
  readonly kind?: string;
  readonly writes?: Readonly<Record<string, string>>;
}

const CASES: ReadonlyArray<DecisionCase> = [
  {
    name: 'moves to the internal target service, keeping the fallback UUID',
    service: 'pn-user-attributes',
    vars: {
      userAttributesNextUrlTarget: 'pn-external-registries',
      userAttributesNextUrl: 'http://internal/...',
      userAttributesFallbackUuidFresh: 'true',
      xRayTraceId: '1-abc',
      fallbackUuid: 'fb-1',
    },
    next: { goTo: 'query-pn-external-registries' },
    kind: 'goto-service',
    writes: { terminationReason: '' },
  },
  {
    name: 'retries the same service with only the detected trace_id after a fallback query',
    service: 'pn-data-vault',
    vars: {
      dataVaultFreshTraceId: SWAP_TRACE,
      dataVaultFreshTraceIdRaw: '3d472be72977635208a92722b97b5e24',
      xRayTraceId: '1-abc',
      fallbackUuid: 'fb-1',
    },
    next: { goTo: 'query-pn-data-vault' },
    kind: 'trace-id-swap',
    writes: {
      xRayTraceId: SWAP_TRACE,
      fallbackUuid: '',
      dataVaultSwappedTraceIdRaw: '3d472be72977635208a92722b97b5e24',
      apiGwTraceIdSwapCount: '1',
      apiGwOriginalTraceId: '1-abc',
    },
  },
  {
    name: 'stops on a target outside the runbook as an external downstream',
    service: 'pn-external-registries',
    vars: {
      externalRegistriesNextUrlTarget: 'AppIO',
      externalRegistriesNextUrl: 'https://api.io.pagopa.it/api/v1/activations/x',
      externalRegistriesErrorMsg: 'Service IO returned errors=404',
      xRayTraceId: '1-abc',
    },
    next: 'stop',
    writes: { terminationReason: 'external-downstream', downstreamTarget: 'AppIO' },
  },
  {
    name: 'stops on a target equal to the current service as a loop',
    service: 'pn-data-vault',
    vars: {
      dataVaultNextUrlTarget: 'pn-data-vault',
      dataVaultNextUrl: 'https://api.pdv.pagopa.it/user-registry/v1/users/abc',
      dataVaultErrorMsg: 'self target detected',
      xRayTraceId: '1-abc',
      fallbackUuid: 'fb-1',
    },
    next: 'stop',
    kind: 'stop',
    writes: { terminationReason: 'loop-detected', lastErrorMsg: 'self target detected' },
  },
  {
    name: 'stops on a destination already visited as a loop',
    service: 'pn-user-attributes',
    vars: {
      userAttributesNextUrlTarget: 'pn-external-registries',
      userAttributesNextUrl: 'http://internal',
      xRayTraceId: '1-abc',
      apiGwVisitedKeys: ['pn-external-registries|1-abc|', 'pn-user-attributes|1-abc|'].join('\n'),
    },
    next: 'stop',
    writes: { terminationReason: 'loop-detected' },
  },
  {
    name: 'stops when a trace_id swap would exceed the safety limit',
    service: 'pn-data-vault',
    vars: { dataVaultFreshTraceId: SWAP_TRACE, xRayTraceId: '1-abc', fallbackUuid: 'fb-1', apiGwTraceIdSwapCount: '5' },
    next: 'stop',
    writes: { terminationReason: 'loop-detected' },
  },
  {
    name: 'does not retry the same service for a fresh fallback UUID alone',
    service: 'pn-data-vault',
    vars: {
      dataVaultNextUrlTarget: '',
      dataVaultFallbackUuidFresh: 'true',
      xRayTraceId: '1-abc',
      fallbackUuid: 'fb-1',
    },
    next: 'stop',
    writes: { terminationReason: 'no-match' },
  },
  {
    name: 'stops with no-match when there is nothing left to follow',
    service: 'pn-user-attributes',
    vars: { xRayTraceId: '1-abc' },
    next: 'stop',
    writes: { terminationReason: 'no-match' },
  },
];

describe('DecideNextStep', () => {
  for (const { name, service, vars, next, kind, writes } of CASES) {
    it(name, async () => {
      const step = new DecideNextStep({
        id: 'decide',
        label: 'Decide',
        serviceName: service,
        varPrefix: PREFIXES[service] ?? '',
        servicesInRunbook: SERVICES,
      });

      const result = await step.execute(createTestContext({ vars }));

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.next, next);
      if (kind !== undefined) assert.strictEqual(result.output?.decision.kind, kind);
      for (const [key, value] of Object.entries(writes ?? {})) assert.strictEqual(result.vars?.[key], value, key);
    });
  }
});
