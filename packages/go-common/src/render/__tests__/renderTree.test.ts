import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderTree } from '../treeRenderer/renderTree.js';

describe('renderTree', () => {
  it('draws tees, elbows and continuation lines at any depth', () => {
    // Last node of a level gets the elbow.
    assert.deepStrictEqual(renderTree([{ label: 'a' }, { label: 'b' }]), ['  ├─ a', '  └─ b']);
    // Children of a last node hang under its label; `│  ` and `   ` keep the same column.
    assert.deepStrictEqual(
      renderTree([
        { label: 'a', children: [{ label: 'a1' }] },
        { label: 'b', children: [{ label: 'b1', children: [{ label: 'b2' }] }] },
      ]),
      ['  ├─ a', '  │  └─ a1', '  └─ b', '     └─ b1', '        └─ b2'],
    );
    assert.deepStrictEqual(renderTree([]), []);
  });

  it('honours a custom indent', () => {
    assert.deepStrictEqual(renderTree([{ label: 'a' }], { indent: '' }), ['└─ a']);
  });

  it('with siblingsFollow keeps the tee and the vertical on the last node', () => {
    assert.deepStrictEqual(renderTree([{ label: 'a', children: [{ label: 'a1' }] }], { siblingsFollow: true }), [
      '  ├─ a',
      '  │  └─ a1',
    ]);
  });
});
