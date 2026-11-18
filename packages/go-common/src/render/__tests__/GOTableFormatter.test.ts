import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOTableFormatter } from '../GOTableFormatter.js';
import type { GOTableColumn, GOTableOptions } from '../GOTableFormatter.js';

const columns: GOTableColumn[] = [
  { header: 'Name', key: 'name' },
  { header: 'Age', key: 'age', align: 'right' },
];

/** Formats without colors. */
function format(options: GOTableOptions): string {
  return new GOTableFormatter({ ...options, style: { colors: false } }).format();
}

describe('GOTableFormatter', () => {
  it('renders full borders with a separator between consecutive rows (snapshot)', () => {
    assert.strictEqual(
      format({
        columns,
        data: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
      }),
      [
        '┌───────┬─────┐',
        '│ Name  │ Age │',
        '├───────┼─────┤',
        '│ Alice │  30 │',
        '├───────┼─────┤',
        '│ Bob   │  25 │',
        '└───────┴─────┘',
      ].join('\n'),
    );
  });

  it('renders compact mode without any border or separator (snapshot)', () => {
    assert.strictEqual(
      format({
        columns,
        data: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
        compact: true,
      }),
      ['  Name    Age  ', '  Alice    30  ', '  Bob      25  '].join('\n'),
    );
  });

  it('renders border-less mode with column separators but no outer frame', () => {
    const out = format({ columns, data: [{ name: 'Alice', age: 30 }], border: false });
    assert.ok(out.includes('Alice'));
    assert.ok(out.includes('│'));
    assert.ok(!out.includes('┌') && !out.includes('└'));
  });

  it('applies custom formatters, explicit widths and maxColumnWidth truncation', () => {
    const formatted = format({
      columns: [{ header: 'Age', key: 'age', formatter: (v: unknown) => `${String(v)} years` }],
      data: [{ age: 30 }],
    });
    assert.ok(formatted.includes('│ 30 years │'));

    assert.ok(
      format({ columns: [{ header: 'Name', key: 'name', width: 10 }], data: [{ name: 'Alice' }] }).includes(
        '│ Alice    │',
      ),
    );

    const truncated = format({
      columns,
      data: [{ name: 'A very long name that should be truncated eventually if it exceeds the limit', age: 1 }],
      maxColumnWidth: 20,
    });
    assert.ok(truncated.includes('│ A very long name … │   1 │'));
  });

  it('aligns right and center deterministically', () => {
    const out = format({
      columns: [
        { header: 'A', key: 'a', width: 5, align: 'right' },
        { header: 'B', key: 'b', width: 7, align: 'center' },
      ],
      data: [{ a: 1, b: 'x' }],
    });
    assert.ok(out.includes('│   1 │   x   │'));
  });

  it('expands row height for cells containing newlines', () => {
    const out = format({
      columns: [
        { header: 'Key', key: 'k' },
        { header: 'Value', key: 'v' },
      ],
      data: [{ k: 'name', v: 'first\nsecond' }],
    });

    assert.deepStrictEqual(out.split('\n').slice(3, 5), ['│ name │ first  │', '│      │ second │']);
  });

  it('renders nothing without columns and only header + borders without data', () => {
    assert.strictEqual(format({ columns: [], data: [{ name: 'ignored' }] }), '');
    assert.strictEqual(
      format({ columns: [{ header: 'Name', key: 'name', width: 8 }], data: [] }),
      ['┌────────┐', '│ Name   │', '├────────┤', '└────────┘'].join('\n'),
    );
  });
});
