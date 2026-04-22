import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { extractTemplateParameters, interpolateTemplate } from '../interpolateTemplate.js';

function createContext(
  params: Record<string, string> = {},
  vars: Record<string, string> = {},
): RunbookContext {
  return {
    executionId: 'test-execution',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(Object.entries(vars)),
    params: new Map(Object.entries(params)),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('interpolateTemplate', () => {
  it('interpolates params and vars placeholders', () => {
    const context = createContext(
      { name: 'Alice', id: 'ABC-123' },
      { status: 'DELIVERED' },
    );

    const result = interpolateTemplate(
      'Hello {{params.name}}, notification {{params.id}} is {{vars.status}}.',
      context,
    );

    assert.strictEqual(result, 'Hello Alice, notification ABC-123 is DELIVERED.');
  });

  it('leaves unresolved placeholders unchanged', () => {
    const context = createContext({ name: 'Alice' });

    const result = interpolateTemplate(
      'Hello {{params.name}} {{params.missing}} {{vars.unknown}}',
      context,
    );

    assert.strictEqual(result, 'Hello Alice {{params.missing}} {{vars.unknown}}');
  });

  it('applies the escape transformer to resolved placeholders only', () => {
    const context = createContext({ name: "O'Brien" });

    const result = interpolateTemplate(
      "SELECT * FROM t WHERE name = '{{params.name}}' AND raw = '{{params.missing}}'",
      context,
      (value) => value.replace(/'/g, "''"),
    );

    assert.strictEqual(
      result,
      "SELECT * FROM t WHERE name = 'O''Brien' AND raw = '{{params.missing}}'",
    );
  });

  it('preserves malformed placeholders while still resolving later valid ones', () => {
    const context = createContext({}, { status: 'READY' });

    const template = '{{vars.|still malformed}} then {{vars.status}}';
    const result = interpolateTemplate(template, context);

    assert.strictEqual(result, '{{vars.|still malformed}} then READY');
  });
});

describe('extractTemplateParameters', () => {
  it('extracts ordered parameters and rewrites placeholders to positional markers', () => {
    const context = createContext(
      { iun: 'IUN-001' },
      { status: 'DELIVERED', channel: 'PEC' },
    );

    const result = extractTemplateParameters(
      'SELECT * FROM notifications WHERE iun = {{params.iun}} AND status = {{vars.status}} AND channel = {{vars.channel}}',
      context,
    );

    assert.deepStrictEqual(result, {
      query: 'SELECT * FROM notifications WHERE iun = ? AND status = ? AND channel = ?',
      parameters: ['IUN-001', 'DELIVERED', 'PEC'],
    });
  });

  it('keeps unresolved and malformed placeholders in the query output', () => {
    const context = createContext({ id: '123' });

    const result = extractTemplateParameters(
      'SELECT {{params.id}}, {{params.missing}}, {{oops|{{params.id}}',
      context,
    );

    assert.deepStrictEqual(result, {
      query: 'SELECT ?, {{params.missing}}, {{oops|?',
      parameters: ['123', '123'],
    });
  });
});
