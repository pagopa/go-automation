import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderTree } from '../treeRenderer/renderTree.js';

describe('renderTree', () => {
  it('marks the last node of a level with the elbow', () => {
    assert.deepStrictEqual(renderTree([{ label: 'a' }, { label: 'b' }]), ['  ├─ a', '  └─ b']);
  });

  it('hangs the children of a last node under its label', () => {
    assert.deepStrictEqual(
      renderTree([{ label: 'Query fallita', children: [{ label: 'Log groups: /a, /b' }, { label: 'Causa: X' }] }]),
      ['  └─ Query fallita', '     ├─ Log groups: /a, /b', '     └─ Causa: X'],
    );
  });

  it('keeps the vertical running under a node that has siblings after it', () => {
    assert.deepStrictEqual(renderTree([{ label: 'a', children: [{ label: 'a1' }] }, { label: 'b' }]), [
      '  ├─ a',
      '  │  └─ a1',
      '  └─ b',
    ]);
  });

  it('puts both continuation styles on the same column', () => {
    // `\u2502  ` and `   ` have the same width, so a1 and b1 line up even
    // though their parents use a different branch.
    assert.deepStrictEqual(
      renderTree([
        { label: 'a', children: [{ label: 'a1' }] },
        { label: 'b', children: [{ label: 'b1' }] },
      ]),
      ['  \u251c\u2500 a', '  \u2502  \u2514\u2500 a1', '  \u2514\u2500 b', '     \u2514\u2500 b1'],
    );
  });

  it('nests to arbitrary depth', () => {
    assert.deepStrictEqual(renderTree([{ label: 'a', children: [{ label: 'b', children: [{ label: 'c' }] }] }]), [
      '  └─ a',
      '     └─ b',
      '        └─ c',
    ]);
  });

  it('honours a custom indent', () => {
    assert.deepStrictEqual(renderTree([{ label: 'a' }], { indent: '' }), ['└─ a']);
  });

  it('returns nothing for an empty tree', () => {
    assert.deepStrictEqual(renderTree([]), []);
  });
});

describe('renderTree with siblingsFollow', () => {
  it('keeps the tee on the last node when more siblings will follow', () => {
    assert.deepStrictEqual(renderTree([{ label: 'a' }], { siblingsFollow: true }), ['  ├─ a']);
  });

  it('keeps the vertical running under that node', () => {
    assert.deepStrictEqual(renderTree([{ label: 'a', children: [{ label: 'a1' }] }], { siblingsFollow: true }), [
      '  ├─ a',
      '  │  └─ a1',
    ]);
  });

  it('closes the level normally when it is not set', () => {
    assert.deepStrictEqual(renderTree([{ label: 'a' }]), ['  └─ a']);
  });
});
