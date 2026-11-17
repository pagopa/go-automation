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
      { node: '22.19.0', scenarios: 'S1,S6' },
      { node: '24', scenarios: 'S1,S6' },
    ]);
  });

  it('raising one package moves only the scenarios that install it', () => {
    const packages = new Map([
      ['@pagopa/c', pkg('@pagopa/c', '>=22.19.0')],
      ['@pagopa/r', pkg('@pagopa/r', '>=24.0.0', ['@pagopa/c'])],
    ]);
    assert.deepStrictEqual(nodeMatrix(scenarios, packages), [
      { node: '22.19.0', scenarios: 'S1' },
      { node: '24', scenarios: 'S1,S6' },
      { node: '24.0.0', scenarios: 'S6' },
    ]);
  });

  it('takes the highest minimum of a closure and rejects ranges without a common minimum', () => {
    assert.strictEqual(scenarioMinimum(['>=22.19.0', '^22.22.2 || ^24.15.0 || >=26.0.0']), '22.22.2');
    assert.throws(() => scenarioMinimum(['not a range']), /no minimum version/u);
    assert.throws(() => scenarioMinimum(['^22.19.0', '>=24.0.0']), /no common minimum/u);
  });
});
