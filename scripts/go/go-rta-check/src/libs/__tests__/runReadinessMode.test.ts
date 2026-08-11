import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runReadinessMode } from '../runReadinessMode.js';
import { COVERAGE_EXIT_CODES } from '../runCoverageCheck.js';

function fakeScript(): { script: { logger: Record<string, (m: string) => void> }; lines: string[] } {
  const lines: string[] = [];
  const record =
    (level: string) =>
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
    resolveConnection: () =>
      Promise.resolve({
        client: {
          getShadowReport: () =>
            Promise.resolve({
              windowDays: 14,
              since: '2026-07-27T00:00:00.000Z',
              capabilities,
              readyCapabilities: capabilities.filter((c) => c['ready'] === true).length,
              totalCapabilities: capabilities.length,
            }),
        },
      }),
    runCheck: () => Promise.resolve({ kind: 'EVALUATED', exitCode: coverageExit }),
  } as never;
}

describe('runReadinessMode', () => {
  it('attiva solo quando copertura e shadow concordano', async () => {
    const { script, lines } = fakeScript();
    const exit = await runReadinessMode(script as never, {} as never, deps(COVERAGE_EXIT_CODES.OK, [capability()]));
    assert.equal(exit, COVERAGE_EXIT_CODES.OK);
    assert.ok(lines.some((l) => l.startsWith('ok:APPLY_KNOWN attivabile')));
  });

  it('non attiva se la copertura statica fallisce, anche con shadow pulito', async () => {
    const { script } = fakeScript();
    const exit = await runReadinessMode(
      script as never,
      {} as never,
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
    const exit = await runReadinessMode(script as never, {} as never, deps(COVERAGE_EXIT_CODES.OK, [blocked]));
    assert.equal(exit, COVERAGE_EXIT_CODES.INVALID_COVERAGE);
    assert.ok(lines.some((l) => l.includes('da censire: downstream:SPID')));
  });

  it('assenza di evidenza non è un via libera', async () => {
    const { script, lines } = fakeScript();
    const exit = await runReadinessMode(script as never, {} as never, deps(COVERAGE_EXIT_CODES.OK, []));
    assert.equal(exit, COVERAGE_EXIT_CODES.INVALID_COVERAGE);
    assert.ok(lines.some((l) => l.includes('non ha ancora prodotto evidenza')));
  });

  it('un errore operativo non si confonde con «non pronto»', async () => {
    const { script } = fakeScript();
    const broken = { resolveConnection: () => Promise.reject(new Error('boom')), runCheck: () => Promise.resolve({}) };
    const exit = await runReadinessMode(script as never, {} as never, broken as never);
    assert.equal(exit, COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
  });
});
