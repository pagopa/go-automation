import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_DIRECT_REQUEST_ID_TEMPLATE, RequestIdTemplate } from '../RequestIdTemplate.js';

describe('RequestIdTemplate.parse', () => {
  it('accepts the default template', () => {
    assert.equal(
      RequestIdTemplate.parse(DEFAULT_DIRECT_REQUEST_ID_TEMPLATE).template,
      DEFAULT_DIRECT_REQUEST_ID_TEMPLATE,
    );
  });

  it('rejects empty templates and unknown placeholders', () => {
    assert.throws(() => RequestIdTemplate.parse('  '), /empty template/);
    assert.throws(() => RequestIdTemplate.parse('X-{rowKey}-{iun}'), /unknown placeholder \{iun\}/);
    assert.throws(() => RequestIdTemplate.parse('X-{rowKey}-{col:}'), /unknown placeholder \{col:\}/);
  });

  it('rejects templates without a row-specific placeholder', () => {
    for (const template of ['FIXED', 'PNMAN.GO-{runId}', 'PNMAN.GO-{runId}.PCRETRY_{attempt}']) {
      assert.throws(() => RequestIdTemplate.parse(template), /no row-specific placeholder/, template);
    }
    for (const template of ['A-{rowKey}', 'A-{rowIndex}', 'A-{col:caso}']) {
      assert.doesNotThrow(() => RequestIdTemplate.parse(template), template);
    }
  });
});

describe('RequestIdTemplate.emptyColumns', () => {
  it('lists each missing or blank column once, in template order', () => {
    const template = RequestIdTemplate.parse('X-{col:b}-{col:a}-{col:b}');
    assert.deepEqual(template.emptyColumns({}), ['b', 'a']);
    assert.deepEqual(template.emptyColumns({ a: ' ', b: 'v' }), ['a']);
    assert.deepEqual(template.emptyColumns({ a: '1', b: '2' }), []);
    assert.deepEqual(RequestIdTemplate.parse('X-{rowKey}').emptyColumns({}), []);
  });
});
