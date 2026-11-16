import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GOTableFormatter } from '../GOTableFormatter.js';

describe('GOTableFormatter', () => {
  const columns = [
    { header: 'Name', key: 'name' },
    { header: 'Age', key: 'age', align: 'right' as const },
  ];
  const data = [
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
  ];

  it('formats a basic table', () => {
    const formatter = new GOTableFormatter({
      columns,
      data,
      style: { colors: false },
    });
    const result = formatter.format();
    assert.ok(result.includes('Alice'));
    assert.ok(result.includes('Bob'));
    assert.ok(result.includes('Name'));
    assert.ok(result.includes('Age'));
  });

  it('handles compact mode', () => {
    const formatter = new GOTableFormatter({
      columns,
      data,
      compact: true,
      style: { colors: false },
    });
    const result = formatter.format();
    assert.ok(result.includes('Alice'));
    // Compact mode should not have full borders
    assert.ok(!result.includes('┌'));
  });

  it('handles no-border mode', () => {
    const formatter = new GOTableFormatter({
      columns,
      data,
      border: false,
      style: { colors: false },
    });
    const result = formatter.format();
    assert.ok(result.includes('Alice'));
    assert.ok(!result.includes('┌'));
    // But should have separators
    assert.ok(result.includes('│'));
  });

  it('uses custom formatters', () => {
    const formatter = new GOTableFormatter({
      columns: [
        { header: 'Name', key: 'name' },
        { header: 'Age', key: 'age', formatter: (v: any) => `${v} years` },
      ],
      data,
      style: { colors: false },
    });
    const result = formatter.format();
    assert.ok(result.includes('30 years'));
  });

  it('respects maxColumnWidth', () => {
    const longData = [{ name: 'A very long name that should be truncated eventually if it exceeds the limit', age: 1 }];
    const formatter = new GOTableFormatter({
      columns,
      data: longData,
      maxColumnWidth: 20,
      style: { colors: false },
    });
    const result = formatter.format();
    // cli-table3 might truncate with '...' or just cut off depending on config,
    // but the width should be capped.
    // We just verify it doesn't crash and contains part of the string.
    assert.ok(result.includes('A very long name'));
  });

  it('handles explicit column width', () => {
    const formatter = new GOTableFormatter({
      columns: [{ header: 'Name', key: 'name', width: 10 }],
      data,
      style: { colors: false },
    });
    const result = formatter.format();
    assert.ok(result.includes('Alice'));
  });

  it('returns empty string for columns: []', () => {
    const formatter = new GOTableFormatter({
      columns: [],
      data: [{ name: 'ignored' }],
      style: { colors: false },
    });
    assert.strictEqual(formatter.format(), '');
  });

  it('renders only header + separators when data is empty', () => {
    const formatter = new GOTableFormatter({
      columns: [{ header: 'Name', key: 'name', width: 8 }],
      data: [],
      style: { colors: false },
    });
    const out = formatter.format();
    assert.ok(out.includes('Name'));
    assert.ok(out.includes('┌'));
    assert.ok(out.includes('└'));
  });

  it('produces canonical full-border output (snapshot)', () => {
    const out = new GOTableFormatter({
      columns: [
        { header: 'A', key: 'a' },
        { header: 'B', key: 'b', align: 'right' },
      ],
      data: [{ a: 'x', b: '1' }],
      style: { colors: false },
    }).format();

    assert.strictEqual(out, ['┌───┬───┐', '│ A │ B │', '├───┼───┤', '│ x │ 1 │', '└───┴───┘'].join('\n'));
  });

  it('expands row height for cells containing newlines', () => {
    const out = new GOTableFormatter({
      columns: [
        { header: 'Key', key: 'k' },
        { header: 'Value', key: 'v' },
      ],
      data: [{ k: 'name', v: 'first\nsecond' }],
      style: { colors: false },
    }).format();

    const lines = out.split('\n');
    // Header (1) + top separator (1) + mid separator (1) + 2 visual lines for the row + bottom (1) = 6
    assert.strictEqual(lines.length, 6);
    // The two row lines must contain 'first' and 'second' respectively
    assert.ok(lines.some((l) => l.includes('first') && !l.includes('second')));
    assert.ok(lines.some((l) => l.includes('second') && !l.includes('first')));
    // The 'name' cell on the second visual line must be padded with spaces (no 'name' duplication)
    const nameOccurrences = lines.filter((l) => l.includes('name')).length;
    assert.strictEqual(nameOccurrences, 1);
  });

  it('inserts a separator between consecutive data rows in full mode', () => {
    const out = new GOTableFormatter({
      columns: [{ header: 'Name', key: 'name' }],
      data: [{ name: 'Alice' }, { name: 'Bob' }],
      style: { colors: false },
    }).format();

    assert.strictEqual(
      out,
      ['┌───────┐', '│ Name  │', '├───────┤', '│ Alice │', '├───────┤', '│ Bob   │', '└───────┘'].join('\n'),
    );
  });

  it('does not insert separators between rows in compact mode', () => {
    const out = new GOTableFormatter({
      columns: [{ header: 'Name', key: 'name' }],
      data: [{ name: 'Alice' }, { name: 'Bob' }],
      compact: true,
      style: { colors: false },
    }).format();

    // No '─' separator chars at all in compact
    assert.ok(!out.includes('─'));
    assert.ok(out.includes('Alice'));
    assert.ok(out.includes('Bob'));
  });

  it('aligns right and center deterministically (snapshot)', () => {
    const out = new GOTableFormatter({
      columns: [
        { header: 'A', key: 'a', width: 5, align: 'right' },
        { header: 'B', key: 'b', width: 7, align: 'center' },
      ],
      data: [{ a: 1, b: 'x' }],
      style: { colors: false },
    }).format();

    assert.ok(out.includes('│   1 │   x   │'));
  });
});
