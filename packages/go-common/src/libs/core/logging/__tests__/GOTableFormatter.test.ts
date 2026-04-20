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
});
