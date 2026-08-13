import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runReadinessMode } from '../runReadinessMode.js';
import { COVERAGE_EXIT_CODES } from '../runCoverageCheck.js';

type LogFn = (message: string) => void;

interface FakeScript {
  readonly script: { readonly logger: Record<string, LogFn> };
  readonly lines: string[];
}

function fakeScript(): FakeScript {
  const lines: string[] = [];
  const record =
    (level: string): LogFn =>
    (message: string): void => {
      lines.push(`${level}:${message}`);
    };
  return {
    script: {
      logger: {
        info: record('info'),
        warning: record('warn'),
        error: record('error'),
        success: record('ok'),
        section: record('sec'),
      },
    },
    lines,
  };
}

function capability(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runbookKey: 'send-apigw-analysis',
    productId: 'p1',
    productName: 'SEND',
    evaluated: 3,
    wouldApply: 3,
    wouldBlock: 0,
    blockedByCode: {},
    unresolvedReferences: [],
    contextValid: 0,
    contextInvalid: 0,
    ready: true,
    ...overrides,
  };
}

function deps(coverageExit: number, capabilities: Record<string, unknown>[]): never {
  return {
    resolveConnection: async () =>
      Promise.resolve({
        client: {
          getShadowReport: async () =>
            Promise.resolve({
              windowDays: 14,
              since: '2026-07-27T00:00:00.000Z',
              capabilities,
              readyCapabilities: capabilities.filter((c) => c['ready'] === true).length,
              totalCapabilities: capabilities.length,
            }),
        },
      }),
    runCheck: async () => Promise.resolve({ kind: 'EVALUATED', exitCode: coverageExit }),
  } as never;
}

describe('runReadinessMode', () => {
  it('attiva solo quando copertura e shadow concordano', async () => {
    const { script, lines } = fakeScript();
    const exit = await runReadinessMode(script as never, {}, deps(COVERAGE_EXIT_CODES.OK, [capability()]));
    assert.equal(exit, COVERAGE_EXIT_CODES.OK);
    assert.ok(lines.some((l) => l.startsWith('ok:APPLY_KNOWN attivabile')));
  });

  it('non attiva se la copertura statica fallisce, anche con shadow pulito', async () => {
    const { script } = fakeScript();
    const exit = await runReadinessMode(
      script as never,
      {},
      deps(COVERAGE_EXIT_CODES.INVALID_COVERAGE, [capability()]),
    );
    assert.equal(exit, COVERAGE_EXIT_CODES.INVALID_COVERAGE);
  });

  it('non attiva se lo shadow ha blocchi, anche con copertura verde', async () => {
    const { script, lines } = fakeScript();
    const blocked = capability({
      wouldApply: 2,
      wouldBlock: 1,
      blockedByCode: { UNRESOLVED_REFERENCES: 1 },
      unresolvedReferences: ['downstream:SPID'],
      ready: false,
    });
    const exit = await runReadinessMode(script as never, {}, deps(COVERAGE_EXIT_CODES.OK, [blocked]));
    assert.equal(exit, COVERAGE_EXIT_CODES.INVALID_COVERAGE);
    assert.ok(lines.some((l) => l.includes('da censire: downstream:SPID')));
  });

  it('assenza di evidenza non è un via libera', async () => {
    const { script, lines } = fakeScript();
    const exit = await runReadinessMode(script as never, {}, deps(COVERAGE_EXIT_CODES.OK, []));
    assert.equal(exit, COVERAGE_EXIT_CODES.INVALID_COVERAGE);
    assert.ok(lines.some((l) => l.includes('non ha ancora prodotto evidenza')));
  });

  it('un errore operativo non si confonde con «non pronto»', async () => {
    const { script } = fakeScript();
    const broken = {
      resolveConnection: async () => Promise.reject(new Error('boom')),
      runCheck: async () => Promise.resolve({}),
    };
    const exit = await runReadinessMode(script as never, {}, broken as never);
    assert.equal(exit, COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
  });
});
