import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogEvent, GOLogger, type GOLoggerHandler } from '@pagopa/go-common/logging';

import { ActionExecutor } from '../ActionExecutor.js';
import type { LogActionRenderer } from '../LogActionRenderer.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { createTestWorkflowServices } from '../../testing/createTestWorkflowServices.js';

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
    services: createTestWorkflowServices(),
    recoveredErrors: [],
  };
}

describe('ActionExecutor', () => {
  it('renders a log action as plain text by default, without prefixes, whatever renderAs says', async () => {
    const handler = new RecordingHandler();
    const result = await new ActionExecutor(new GOLogger([handler])).execute(
      {
        type: 'log',
        level: 'info',
        renderAs: 'known-case',
        title: 'Errore {{vars.code}}',
        details: [
          ['Codice', '{{vars.code}}'],
          ['Ambiente', '{{vars.missing}}'],
        ],
      },
      createContext(new Map([['code', 'E42']])),
    );

    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.resolvedMessage, 'Errore E42\nCodice: E42\nAmbiente: non disponibile');
    assert.deepStrictEqual(
      handler.events.map((event) => event.message),
      ['Errore E42\nCodice: E42\nAmbiente: non disponibile'],
    );
  });

  it('delegates text and console rendering to the injected renderer', async () => {
    const rendered: string[] = [];
    const renderer: LogActionRenderer = {
      renderText: (action) => `custom ${action.title}`,
      renderToLogger: (_logger, action) => {
        rendered.push(action.title);
      },
    };

    const result = await new ActionExecutor(new GOLogger(), renderer).execute(
      { type: 'log', level: 'warn', title: 'boom' },
      createContext(),
    );

    assert.strictEqual(result.resolvedMessage, 'custom boom');
    assert.deepStrictEqual(rendered, ['boom']);
  });

  it('resolves notifications and escalations against the context', async () => {
    const executor = new ActionExecutor(new GOLogger());
    const context = createContext(new Map([['team', 'GO']]));

    const notify = await executor.execute({ type: 'notify', channel: '#ops', template: 'to {{vars.team}}' }, context);
    const escalate = await executor.execute(
      { type: 'escalate', team: 'GO', severity: 'high', message: 'page {{vars.team}}' },
      context,
    );

    assert.strictEqual(notify.resolvedMessage, 'to GO');
    assert.strictEqual(escalate.resolvedMessage, 'page GO');
  });
});
