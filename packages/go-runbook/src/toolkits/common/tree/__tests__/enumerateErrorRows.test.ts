import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { enumerateErrorRows } from '../enumerateErrorRows.js';
import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../__tests__/helpers/logRow.js';

const SCHEMA = { messageFieldCandidates: ['message'], levelField: 'level', traceIdField: 'trace_id' };

describe('enumerateErrorRows', () => {
  it('counts an error keyword only in a row without level', () => {
    const errorLevel = logRow({ level: 'ERROR', message: 'write failed' });
    const warnLevel = logRow({ level: 'warn', message: 'retrying' });
    const keywordWithoutLevel = logRow({ message: 'TimeoutError: socket hang up' });
    const keywordAtInfo = logRow({ level: 'INFO', message: 'Error handler registered' });
    const plain = logRow({ message: 'request received' });

    const { nodes } = enumerateErrorRows(
      'read-trace',
      'deliveryTrace',
      SCHEMA,
      't',
    )({
      context: createTestContext(),
      rows: [errorLevel, warnLevel, keywordWithoutLevel, keywordAtInfo, plain],
    });

    assert.deepStrictEqual(
      nodes.map(({ key, label }) => [key, label]),
      [
        ['t1', 'write failed'],
        ['t2', 'retrying'],
        ['t3', 'TimeoutError: socket hang up'],
      ],
    );
    const first = nodes[0];
    assert.deepStrictEqual(first?.vars, { deliveryTraceErrorMsg: 'write failed', lastErrorMsg: 'write failed' });
    assert.deepStrictEqual(first?.scopedOutputs, { 'read-trace': [errorLevel] });
    assert.deepStrictEqual(first?.contextOutputs, { 'read-trace': [keywordAtInfo, plain] });
    assert.deepStrictEqual(first?.siblingOutputs, { 'read-trace': [errorLevel, warnLevel, keywordWithoutLevel] });
  });

  it('labels an error without message', () => {
    const { nodes } = enumerateErrorRows(
      'read',
      'x',
      SCHEMA,
      'e',
    )({
      context: createTestContext(),
      rows: [logRow({ level: 'ERROR' })],
    });
    assert.strictEqual(nodes[0]?.label, 'errore senza messaggio');
  });
});
