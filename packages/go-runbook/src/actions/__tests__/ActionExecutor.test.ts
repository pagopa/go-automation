import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogEvent, GOLogEventCategory, GOLogger } from '@go-automation/go-common/core';
import type { GOLoggerHandler } from '@go-automation/go-common/core';

import { ActionExecutor } from '../ActionExecutor.js';
import type { ServiceRegistry } from '../../services/ServiceRegistry.js';
import type { RunbookContext } from '../../types/RunbookContext.js';

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

function createContext(): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('ActionExecutor', () => {
  it('renders known-case log actions as a separated success block with a table', async () => {
    const handler = new RecordingHandler();
    const executor = new ActionExecutor(new GOLogger([handler]));

    await executor.execute(
      {
        type: 'log',
        level: 'info',
        message:
          '[CASO NOTO] [DOWNSTREAM] Service PersonalDataVault_UserRegistry returned errors=500 Internal Server Error\n' +
          'Risoluzione: Chiusura - caso noto\n' +
          'Downstream: PersonalDataVault\n',
      },
      createContext(),
    );

    assert.strictEqual(handler.events[0]?.category, GOLogEventCategory.TEXT);
    assert.strictEqual(handler.events[0]?.message, '');
    assert.strictEqual(handler.events[1]?.category, GOLogEventCategory.SUCCESS);
    assert.strictEqual(handler.events[1]?.message, 'Caso noto rilevato');
    assert.strictEqual(
      handler.events.some((event) => event.category === GOLogEventCategory.INFO),
      false,
    );
    assert.strictEqual(
      handler.events.some((event) => event.message.includes('Risoluzione')),
      true,
    );
    assert.strictEqual(
      handler.events.some((event) => event.message.includes('PersonalDataVault')),
      true,
    );
  });

  it('keeps ordinary info log actions unchanged', async () => {
    const handler = new RecordingHandler();
    const executor = new ActionExecutor(new GOLogger([handler]));

    await executor.execute({ type: 'log', level: 'info', message: 'plain message' }, createContext());

    assert.strictEqual(handler.events.length, 1);
    assert.strictEqual(handler.events[0]?.category, GOLogEventCategory.INFO);
    assert.strictEqual(handler.events[0]?.message, 'plain message');
  });
});
