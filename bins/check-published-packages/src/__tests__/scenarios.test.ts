import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildScenarios, GO_AWS_SUBPATH_PEERS, specifier, uncoveredSubpaths } from '../scenarios.js';

const GO_COMMON_SUBPATHS = ['./errors', './utils', './http'];
const GO_RUNBOOK_SUBPATHS = [
  '.',
  './output',
  './toolkits/common',
  './toolkits/send',
  './toolkits/interop',
  './inventory',
  './runtime',
];

describe('buildScenarios', () => {
  const scenarios = buildScenarios(GO_COMMON_SUBPATHS, GO_RUNBOOK_SUBPATHS);
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));

  it('defines S1, one S4 per go-aws subpath, S6, S7 and S8', () => {
    assert.ok(byId.has('S1') && byId.has('S6') && byId.has('S7') && byId.has('S8'));
    assert.strictEqual(scenarios.filter((scenario) => scenario.id.startsWith('S4-')).length, GO_AWS_SUBPATH_PEERS.size);
    assert.deepStrictEqual(byId.get('S4-sqs')?.peers, ['@aws-sdk/client-sqs', '@aws-sdk/client-cloudwatch']);
    assert.deepStrictEqual(byId.get('S4-cloudwatch-logs-insights')?.peers, []);
  });

  it('installs no SDK in S6 and never EC2 with go-runbook', () => {
    assert.deepStrictEqual(byId.get('S6')?.peers, []);
    assert.ok(!byId.get('S6')?.imports.includes('@pagopa/go-runbook/runtime'));
    for (const id of ['S7', 'S8']) assert.ok(!byId.get(id)?.peers.includes('@aws-sdk/client-ec2'));
    assert.ok(byId.get('S8')?.lambdaBundle === true);
  });

  it('reports every published subpath that no scenario imports', () => {
    const exportsByPackage = new Map([
      ['@pagopa/go-common', GO_COMMON_SUBPATHS],
      ['@pagopa/go-aws', [...GO_AWS_SUBPATH_PEERS.keys(), './new-service']],
      ['@pagopa/go-runbook', GO_RUNBOOK_SUBPATHS],
    ]);
    assert.deepStrictEqual(uncoveredSubpaths(exportsByPackage, scenarios), ['@pagopa/go-aws/new-service']);
  });

  it('builds specifiers for the root and for subpaths', () => {
    assert.strictEqual(specifier('@pagopa/go-aws', '.'), '@pagopa/go-aws');
    assert.strictEqual(
      specifier('@pagopa/go-aws', './cloudwatch-logs/insights'),
      '@pagopa/go-aws/cloudwatch-logs/insights',
    );
  });
});
