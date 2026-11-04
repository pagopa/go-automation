import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseDefaults } from '../parseDefaults.js';

describe('parseDefaults', () => {
  it('parses canonical field defaults and rejects typos', () => {
    assert.deepEqual(
      [...parseDefaults(['direct.aar.key = PN_AAR-1.pdf', 'sender.taxId=00000000001'])],
      [
        ['direct.aar.key', 'PN_AAR-1.pdf'],
        ['sender.taxId', '00000000001'],
      ],
    );
    assert.throws(() => parseDefaults(['sender.taxid=1']), /unknown field "sender.taxid"/);
    assert.throws(() => parseDefaults(['sender.taxId']), /missing value/);
    assert.throws(() => parseDefaults(['sender.taxId=']), /missing value/);
  });

  it('joins back a value split on commas by the command-line parser', () => {
    // --defaults "sender.denomination=Comune di X, Ufficio Y" "notificationOptions.taxonomyCode=010202N"
    const values = parseDefaults([
      'sender.denomination=Comune di X',
      'Ufficio Y',
      'Area Z',
      'notificationOptions.taxonomyCode=010202N',
    ]);
    assert.equal(values.get('sender.denomination'), 'Comune di X, Ufficio Y, Area Z');
    assert.equal(values.get('notificationOptions.taxonomyCode'), '010202N');
  });

  it('keeps "=" inside a continuation and still reports an unknown field that looks like one', () => {
    assert.equal(parseDefaults(['subject=A', 'Ufficio B = C']).get('subject'), 'A, Ufficio B = C');
    assert.throws(() => parseDefaults(['subject=A', 'sender.taxid=1']), /unknown field "sender.taxid"/);
  });

  it('reports a first item without field', () => {
    assert.throws(() => parseDefaults(['Comune di X']), /unknown field "Comune di X"/);
  });
});
