import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOLogger } from '@go-automation/go-common/core';

import { ConsoleRunbookReporter } from '../reporters/ConsoleRunbookReporter.js';

function capture(): { readonly lines: string[]; readonly logger: GOLogger } {
  const lines: string[] = [];
  const logger = {
    text: (line: string): void => void lines.push(line),
    newline: (): void => void lines.push(''),
  } as unknown as GOLogger;
  return { lines, logger };
}

describe('ConsoleRunbookReporter', () => {
  it('holds a node back until it knows whether a sibling follows', () => {
    const { lines, logger } = capture();
    const reporter = new ConsoleRunbookReporter(logger);

    reporter.add({ label: 'a' });
    assert.deepStrictEqual(lines, [], 'the first node must not be drawn yet');

    reporter.add({ label: 'b' });
    assert.deepStrictEqual(lines, ['  ├─ a']);

    reporter.flush();
    assert.deepStrictEqual(lines, ['  ├─ a', '  └─ b']);
  });

  it('closes the level when a new section opens', () => {
    const { lines, logger } = capture();
    const reporter = new ConsoleRunbookReporter(logger);

    reporter.section('Servizio: pn-address-manager');
    reporter.add({ label: 'Log group: /aws/ecs/pn' });
    reporter.section('Esecuzione terminata');

    assert.deepStrictEqual(lines, [
      '',
      '═══ Servizio: pn-address-manager ═══',
      '  └─ Log group: /aws/ecs/pn',
      '',
      '═══ Esecuzione terminata ═══',
    ]);
  });

  it('never emits two elbows in a row for nodes reported by different callers', () => {
    const { lines, logger } = capture();
    const reporter = new ConsoleRunbookReporter(logger);

    // Two steps reporting one node each: the defect F4 could not fix.
    reporter.add({ label: 'Batch POSTEL WORKED: 10/10' });
    reporter.add({ label: 'Query trace: skip' });
    reporter.flush();

    assert.deepStrictEqual(lines, ['  ├─ Batch POSTEL WORKED: 10/10', '  └─ Query trace: skip']);
  });

  it('keeps the vertical running under a node that turns out not to be last', () => {
    const { lines, logger } = capture();
    const reporter = new ConsoleRunbookReporter(logger);

    reporter.add({ label: 'Analisi log', children: [{ label: 'Errori: 25' }] });
    reporter.add({ label: 'Verifica batch' });
    reporter.flush();

    assert.deepStrictEqual(lines, ['  ├─ Analisi log', '  │  └─ Errori: 25', '  └─ Verifica batch']);
  });

  it('accepts several nodes in one call', () => {
    const { lines, logger } = capture();
    const reporter = new ConsoleRunbookReporter(logger);

    reporter.add({ label: 'a' }, { label: 'b' }, { label: 'c' });
    reporter.flush();

    assert.deepStrictEqual(lines, ['  ├─ a', '  ├─ b', '  └─ c']);
  });

  it('is a no-op when nothing was reported', () => {
    const { lines, logger } = capture();
    new ConsoleRunbookReporter(logger).flush();
    assert.deepStrictEqual(lines, []);
  });
});
