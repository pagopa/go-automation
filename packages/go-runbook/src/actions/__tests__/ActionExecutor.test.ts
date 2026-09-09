import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogEvent, GOLogEventCategory, GOLogger } from '@go-automation/go-common/core';
import type { GOLoggerHandler } from '@go-automation/go-common/core';

import { ActionExecutor } from '../ActionExecutor.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../registry/createTestServiceRegistry.js';

class RecordingHandler implements GOLoggerHandler {
  readonly events: GOLogEvent[] = [];

  handle(event: GOLogEvent): void {
    this.events.push(event);
  }

  async reset(): Promise<void> {
    await Promise.resolve();
    this.events.length = 0;
  }
}

function createContext(vars: ReadonlyMap<string, string> = new Map()): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(),
    vars,
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('ActionExecutor', () => {
  it('renders a known case as a separated success block with a table', async () => {
    const handler = new RecordingHandler();
    const executor = new ActionExecutor(new GOLogger([handler]));

    await executor.execute(
      {
        type: 'log',
        level: 'info',
        renderAs: 'known-case',
        title: '[DOWNSTREAM] Service PersonalDataVault returned errors=500',
        details: [
          ['Risoluzione', 'Chiusura - caso noto'],
          ['Downstream', 'PersonalDataVault'],
        ],
      },
      createContext(),
    );

    const joined = handler.events.map((event) => event.message).join('\n');
    assert.match(joined, /Caso noto rilevato/);
    assert.match(joined, /Risoluzione/);
    assert.match(joined, /Chiusura - caso noto/);
    assert.match(joined, /PersonalDataVault/);
  });

  it('keeps ordinary info log actions unchanged', async () => {
    const handler = new RecordingHandler();
    await new ActionExecutor(new GOLogger([handler])).execute(
      { type: 'log', level: 'info', title: 'Nessun caso noto individuato' },
      createContext(),
    );

    assert.strictEqual(handler.events.at(-1)?.category, GOLogEventCategory.INFO);
    assert.match(handler.events.at(-1)?.message ?? '', /Nessun caso noto individuato/);
  });

  it('resolves each row on its own, so a value carrying a newline stays in its row', async () => {
    // Regression: the executor used to re-parse the rendered message, which
    // turned every line of a stack trace into a column name of its own.
    const vars = new Map([['lastErrorMsg', 'java.lang.NullPointerException\n\tat it.pagopa.Foo.bar(Foo.java:42)']]);
    const result = await new ActionExecutor(new GOLogger()).execute(
      {
        type: 'log',
        level: 'info',
        renderAs: 'known-case',
        title: 'Errore applicativo',
        details: [
          ['Errore', '{{vars.lastErrorMsg}}'],
          ['Trace ID', '{{vars.traceId}}'],
        ],
      },
      createContext(vars),
    );

    const lines = (result.resolvedMessage ?? '').split('\n');
    assert.strictEqual(lines[0], '[CASO NOTO] Errore applicativo');
    assert.strictEqual(lines[1], 'Errore: java.lang.NullPointerException');
    // The frame stays part of the error value; the next row follows it.
    assert.match(lines[2] ?? '', /^\tat it\.pagopa\.Foo\.bar/);
    assert.strictEqual(lines.at(-1), 'Trace ID: non disponibile');
  });

  it('renders an unknown case as a warning table, dropping rows the run never produced', async () => {
    const handler = new RecordingHandler();
    await new ActionExecutor(new GOLogger([handler])).execute(
      {
        type: 'log',
        level: 'warn',
        renderAs: 'unknown-case',
        title: "Impossibile identificare univocamente la causa dell'errore.",
        details: [
          ['Dettaglio', 'nessun caso noto ha soddisfatto le condizioni del runbook.'],
          ['Errori API Gateway', '{{vars.apiGwErrorCount}}'],
          ['Status API Gateway', '{{vars.apiGwStatusCode}}'],
        ],
      },
      createContext(new Map([['apiGwErrorCount', '3']])),
    );

    const joined = handler.events.map((event) => event.message).join('\n');
    assert.match(joined, /Caso non riconosciuto/);
    assert.match(joined, /Errori API Gateway/);
    // Never a raw placeholder, and no row for a value the run did not produce.
    assert.doesNotMatch(joined, /\{\{vars\./u);
    assert.doesNotMatch(joined, /Status API Gateway/);
  });

  it('substitutes a placeholder the run never resolved instead of leaking it', async () => {
    const result = await new ActionExecutor(new GOLogger()).execute(
      {
        type: 'log',
        level: 'warn',
        renderAs: 'unknown-case',
        title: 'Mancata diagnosi',
        details: [['Ambiente', '{{vars.env}}']],
      },
      createContext(),
    );

    assert.strictEqual(result.resolvedMessage, '[CASO NON RICONOSCIUTO] Mancata diagnosi\nAmbiente: non disponibile');
  });

  it('substitutes an unresolved placeholder in the title too, not only in the rows', async () => {
    // The console table and the stored `resolvedMessage` describe the same
    // action: a title rendered without the fallback leaked `{{vars.x}}` into
    // the very table whose rows already read `non disponibile`.
    const handler = new RecordingHandler();
    const action = {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      title: 'Timeout su {{vars.serviceName}}',
      details: [['Errore', '{{vars.errorMsg}}']],
    } as const;

    const result = await new ActionExecutor(new GOLogger([handler])).execute(action, createContext());

    const joined = handler.events.map((event) => event.message).join('\n');
    assert.doesNotMatch(joined, /\{\{vars\.serviceName\}\}/u, 'the title must not leak a raw placeholder');
    assert.match(joined, /Timeout su non disponibile/u);
    assert.match(result.resolvedMessage ?? '', /Timeout su non disponibile/u);
  });
});
