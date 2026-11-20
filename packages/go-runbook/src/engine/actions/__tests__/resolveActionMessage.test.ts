import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveActionMessage } from '../resolveActionMessage.js';
import type { LogActionRenderer } from '../LogActionRenderer.js';

const RENDERER: LogActionRenderer = { renderText: () => 'rendered' };

describe('resolveActionMessage', () => {
  it('bounds a message that copies a long error, for the executor and the output alike', () => {
    const message = resolveActionMessage(
      { type: 'notify', channel: '#ops', template: 'Errore: {{vars.error}}' },
      { vars: new Map([['error', 'x'.repeat(5000)]]), params: new Map() },
      RENDERER,
    );
    assert.equal(message?.length, 4000);
    assert.ok(message?.startsWith('Errore: x'));
  });

  it('keeps a short message', () => {
    const values = { vars: new Map([['team', 'GO']]), params: new Map<string, string>() };
    assert.equal(
      resolveActionMessage(
        { type: 'escalate', team: 'GO', severity: 'high', message: 'to {{vars.team}}' },
        values,
        RENDERER,
      ),
      'to GO',
    );
  });
});
