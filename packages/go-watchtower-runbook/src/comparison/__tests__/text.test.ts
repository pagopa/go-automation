import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { namesIdentifier, normalize, tokenDice } from '../text.js';

describe('text', () => {
  it('normalizes to lowercase, strips accents and collapses whitespace', () => {
    assert.strictEqual(normalize('Società   TIMEOUT'), 'societa timeout');
  });

  it('tokenDice is 1 for identical token sets, 0 for disjoint ones and in between on partial overlap', () => {
    assert.strictEqual(tokenDice('timeout della lambda', 'timeout della lambda'), 1);
    assert.strictEqual(tokenDice('aaa bbb', 'ccc ddd'), 0);
    const partial = tokenDice('timeout della lambda', 'timeout runtime');
    assert.ok(partial > 0 && partial < 1, String(partial));
  });

  it('names an identifier only as a whole token, never inside a longer code or id', () => {
    const text = normalize('Caso SEND_SERVICE_PDRCEFLA_MIS-DRI-CAP-FAK-GEO-UAT, poi missing-drivers.');
    assert.strictEqual(namesIdentifier(text, 'SEND_SERVICE_PDRCEFLA_MIS-DRI-CAP-FAK-GEO-UAT'), true);
    assert.strictEqual(namesIdentifier(text, 'SEND_SERVICE_PDRCEFLA_MIS-DRI-CAP'), false);
    assert.strictEqual(namesIdentifier(text, 'missing-drivers'), true);
    assert.strictEqual(namesIdentifier(text, 'drivers'), false);
  });
});
