import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateBudget, packageOfInput, type ModuleGraph } from '../evaluateBudget.js';
import { parseTiming } from '../measureBudget.js';

describe('evaluateBudget (EVO-PKGPUB-OPUS-01 §10.4)', () => {
  const graph = (thirdParty: ReadonlyArray<string>, hasNativeModule = false): ModuleGraph => ({
    thirdParty,
    hasNativeModule,
  });

  it('passes a graph within every rule and the time', () => {
    assert.deepStrictEqual(
      evaluateBudget(
        { specifiers: ['a'], maxMilliseconds: 60, forbidden: ['@aws-sdk/', 'undici'] },
        graph(['luxon']),
        40,
        1,
      ),
      [],
    );
  });

  it('reports the time, allowed and forbidden packages, SDK clients and native modules', () => {
    const failures = evaluateBudget(
      {
        specifiers: ['a', 'b'],
        maxMilliseconds: 10,
        allowedThirdParty: ['luxon'],
        forbidden: ['@aws-sdk/', 'undici'],
        onlySdkClients: ['@aws-sdk/client-s3'],
        noNativeModules: true,
      },
      graph(['luxon', 'undici', '@aws-sdk/client-s3', '@aws-sdk/client-ec2'], true),
      12,
      1,
    );
    assert.strictEqual(failures.length, 6);
    assert.match(failures.join('\n'), /12 ms, budget < 10 ms/u);
    assert.match(failures.join('\n'), /SDK clients not allowed: @aws-sdk\/client-ec2/u);
    assert.match(failures.join('\n'), /native \.node module/u);
  });

  it('widens only the time with the factor', () => {
    assert.deepStrictEqual(evaluateBudget({ specifiers: ['a'], maxMilliseconds: 10 }, graph([]), 15, 2), []);
    assert.strictEqual(
      evaluateBudget({ specifiers: ['a'], maxMilliseconds: 10, forbidden: ['undici'] }, graph(['undici']), 1, 2).length,
      1,
    );
  });
});

describe('packageOfInput', () => {
  it('names the innermost package of a node_modules path, and nothing for workspace files', () => {
    assert.strictEqual(packageOfInput('node_modules/.pnpm/luxon@3.7.2/node_modules/luxon/src/luxon.js'), 'luxon');
    assert.strictEqual(
      packageOfInput('../../node_modules/.pnpm/@aws-sdk+client-s3@3/node_modules/@aws-sdk/client-s3/dist-es/index.js'),
      '@aws-sdk/client-s3',
    );
    assert.strictEqual(packageOfInput('packages/go-runbook/dist/index.js'), undefined);
  });
});

describe('parseTiming', () => {
  it('reads only the marked line, ignoring what imported modules print', () => {
    assert.strictEqual(parseTiming('loading…\nGO_IMPORT_COST_MS=12.5\n'), 12.5);
  });

  it('rejects a missing, non-finite or negative timing instead of passing the budget', () => {
    assert.throws(() => parseTiming('hello\n'), /no valid timing/u);
    assert.throws(() => parseTiming('GO_IMPORT_COST_MS=NaN'), /no valid timing/u);
    assert.throws(() => parseTiming('GO_IMPORT_COST_MS=-1'), /no valid timing/u);
  });
});
