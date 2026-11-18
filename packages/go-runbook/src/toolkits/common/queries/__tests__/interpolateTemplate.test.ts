import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractTemplateParameters } from '../interpolateTemplate.js';
import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';

describe('extractTemplateParameters', () => {
  it('extracts ordered parameters and rewrites placeholders to positional markers', () => {
    const context = createTestContext({
      params: { iun: 'IUN-001' },
      vars: { status: 'DELIVERED', channel: 'PEC' },
    });

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
    const result = extractTemplateParameters(
      'SELECT {{params.id}}, {{params.missing}}, {{oops|{{params.id}}',
      createTestContext({ params: { id: '123' } }),
    );

    assert.deepStrictEqual(result, {
      query: 'SELECT ?, {{params.missing}}, {{oops|?',
      parameters: ['123', '123'],
    });
  });
});
