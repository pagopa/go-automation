import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOJSONArrayScanner } from '../GOJSONArrayScanner.js';

/** Feeds `document` in chunks of `size` characters and returns the element texts. */
function scan(document: string, size = document.length): string[] {
  const scanner = new GOJSONArrayScanner();
  const texts: string[] = [];
  for (let i = 0; i < document.length; i += size) {
    texts.push(...scanner.push(document.slice(i, i + size)));
  }
  scanner.end();
  return texts;
}

const TRICKY = `[
  {"text": "a, b ] } [ {", "quote": "say \\"hi\\", ok", "path": "C:\\\\dir\\\\"},
  [1, [2, 3]],
  "plain, string",
  -1.5e3,
  true,
  null,
  {"emoji": "è 😀"}
]`;

describe('GOJSONArrayScanner', () => {
  it('splits the top-level array into element texts that JSON.parse round-trips', () => {
    const texts = scan(TRICKY);

    assert.deepEqual(
      texts.map((text) => JSON.parse(text) as unknown),
      JSON.parse(TRICKY) as unknown,
    );
  });

  it('gives the same elements whatever the chunk boundaries', () => {
    const whole = scan(TRICKY);
    for (const size of [1, 2, 3, 7, 16]) {
      assert.deepEqual(scan(TRICKY, size), whole, `chunks of ${size}`);
    }
  });

  it('reads an empty array, with BOM and surrounding whitespace', () => {
    assert.deepEqual(scan('\uFEFF  [ \n ]  \n'), []);
  });

  it('reports a document that is not an array, without consuming it', () => {
    const scanner = new GOJSONArrayScanner();

    assert.deepEqual(scanner.push('  {"a": [1, 2]}'), []);
    assert.equal(scanner.isArray, false);
    assert.doesNotThrow(() => scanner.end());
  });

  it('leaves isArray undefined for an empty document', () => {
    const scanner = new GOJSONArrayScanner();
    scanner.push('   ');
    scanner.end();

    assert.equal(scanner.isArray, undefined);
  });

  it('rejects a malformed array structure', () => {
    assert.throws(() => scan('[1, 2'), /not closed/);
    assert.throws(() => scan('[{"a": 1}'), /not closed/);
    assert.throws(() => scan('[1,]'), /unexpected "\]"/);
    assert.throws(() => scan('[,1]'), /unexpected ","/);
    assert.throws(() => scan('[1, 2] x'), /after the end of the array/);
    assert.throws(() => scan('[1}]'), /unbalanced "\}"/);
  });
});
