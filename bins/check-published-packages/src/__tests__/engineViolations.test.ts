import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { engineViolations } from '../checkEngines.js';
import { nodeMatrix, scenarioMinimum } from '../nodeMatrix.js';
import type { PackedPackage } from '../types/PackedPackage.js';
import type { SmokeScenario } from '../types/SmokeScenario.js';

describe('engineViolations', () => {
  it('accepts dependencies whose range contains the declared one', () => {
    assert.deepStrictEqual(
      engineViolations({ name: '@pagopa/go-common', enginesNode: '>=22.19.0' }, [
        { id: 'undici@8.12.4', range: '>=22.19.0' },
      ]),
      [],
    );
  });

  it('reports a dependency that needs a newer Node than the package declares', () => {
    const failures = engineViolations({ name: '@pagopa/go-script', enginesNode: '>=22.19.0' }, [
      { id: '@inquirer/prompts@8.8.0', range: '^22.22.2 || ^24.15.0 || >=26.0.0' },
    ]);
    assert.strictEqual(failures.length, 1);
    assert.match(failures[0] ?? '', /@inquirer\/prompts@8\.8\.0 requires/u);
  });

  it('reports an invalid or missing declared range and ignores dependencies without a valid range', () => {
    assert.match(engineViolations({ name: 'x', enginesNode: 'not a range' }, [])[0] ?? '', /invalid engines\.node/u);
    assert.match(engineViolations({ name: 'x', enginesNode: '' }, [])[0] ?? '', /invalid engines\.node/u);
    assert.deepStrictEqual(
      engineViolations({ name: 'x', enginesNode: '>=22.19.0' }, [
        { id: 'y@1.0.0', range: 'whatever' },
        { id: 'z@1.0.0' },
      ]),
      [],
    );
  });
});

describe('nodeMatrix', () => {
  const pkg = (name: string, enginesNode: string, internalDependencies: ReadonlyArray<string> = []): PackedPackage => ({
    name,
    version: '0.0.0',
    tarball: '',
    enginesNode,
    subpaths: ['.'],
    internalDependencies,
  });
  const scenario = (id: string, packages: ReadonlyArray<string>): SmokeScenario => ({
    id,
    description: id,
    packages,
    peers: [],
    imports: [],
  });
  const scenarios = [scenario('S1', ['@pagopa/c']), scenario('S6', ['@pagopa/r'])];

  it('runs each scenario on the minimum of its own dependency closure and on the toolchain major', () => {
    const packages = new Map([
      ['@pagopa/c', pkg('@pagopa/c', '>=22.19.0')],
      ['@pagopa/r', pkg('@pagopa/r', '>=22.19.0', ['@pagopa/c'])],
    ]);
    assert.deepStrictEqual(nodeMatrix(scenarios, packages), [
      { node: '22.19.0', shard: '1/1', scenarios: 'S1,S6' },
      { node: '24', shard: '1/1', scenarios: 'S1,S6' },
    ]);
  });

  it('splits the scenarios of each Node version into consecutive shards of nearly equal size', () => {
    const many = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'].map((id) => scenario(id, ['@pagopa/c']));
    const packages = new Map([['@pagopa/c', pkg('@pagopa/c', '>=22.19.0')]]);
    const cells = nodeMatrix(many, packages, 3);
    assert.deepStrictEqual(cells, [
      { node: '22.19.0', shard: '1/3', scenarios: 'S1,S2,S3' },
      { node: '22.19.0', shard: '2/3', scenarios: 'S4,S5' },
      { node: '22.19.0', shard: '3/3', scenarios: 'S6,S7' },
      { node: '24', shard: '1/3', scenarios: 'S1,S2,S3' },
      { node: '24', shard: '2/3', scenarios: 'S4,S5' },
      { node: '24', shard: '3/3', scenarios: 'S6,S7' },
    ]);
  });

  it('never creates an empty shard and rejects a shard count below one', () => {
    const packages = new Map([
      ['@pagopa/c', pkg('@pagopa/c', '>=22.19.0')],
      ['@pagopa/r', pkg('@pagopa/r', '>=22.19.0', ['@pagopa/c'])],
    ]);
    assert.deepStrictEqual(nodeMatrix(scenarios, packages, 5), [
      { node: '22.19.0', shard: '1/2', scenarios: 'S1' },
      { node: '22.19.0', shard: '2/2', scenarios: 'S6' },
      { node: '24', shard: '1/2', scenarios: 'S1' },
      { node: '24', shard: '2/2', scenarios: 'S6' },
    ]);
    assert.throws(() => nodeMatrix(scenarios, packages, 0), /positive integer/u);
    assert.throws(() => nodeMatrix(scenarios, packages, Number.NaN), /positive integer/u);
  });

  it('raising one package moves only the scenarios that install it', () => {
    const packages = new Map([
      ['@pagopa/c', pkg('@pagopa/c', '>=22.19.0')],
      ['@pagopa/r', pkg('@pagopa/r', '>=24.0.0', ['@pagopa/c'])],
    ]);
    assert.deepStrictEqual(nodeMatrix(scenarios, packages), [
      { node: '22.19.0', shard: '1/1', scenarios: 'S1' },
      { node: '24', shard: '1/1', scenarios: 'S1,S6' },
      { node: '24.0.0', shard: '1/1', scenarios: 'S6' },
    ]);
  });

  it('takes the highest minimum of a closure and rejects ranges without a common minimum', () => {
    assert.strictEqual(scenarioMinimum(['>=22.19.0', '^22.22.2 || ^24.15.0 || >=26.0.0']), '22.22.2');
    assert.throws(() => scenarioMinimum(['not a range']), /no minimum version/u);
    assert.throws(() => scenarioMinimum(['^22.19.0', '>=24.0.0']), /no common minimum/u);
  });
});
