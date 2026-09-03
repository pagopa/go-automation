/**
 * Spaces a tab is replaced with.
 *
 * The value is a readability choice, not an attempt to reproduce terminal
 * tab stops: what matters is that the expansion happens at all, so the
 * width the formatter measures is the width the terminal renders. Two
 * spaces keep indented payloads — stack traces, pretty-printed JSON —
 * legible without widening the column.
 */
const TAB_REPLACEMENT = '  ';

const TAB_PATTERN = /\t/gu;

/**
 * Replaces tabs with spaces in a cell value.
 *
 * `string-width` measures a tab as **zero** columns while a terminal
 * advances it to the next tab stop, so an un-expanded tab makes the cell
 * render wider than the table computed and pushes the right border out of
 * alignment for that line only. Expanding first keeps measurement and
 * rendering in agreement.
 *
 * @param text - Raw cell text, possibly containing tabs
 * @returns The text with every tab replaced by spaces
 *
 * @example
 * ```typescript
 * expandTabs('at Foo.bar\n\tat Baz.qux'); // 'at Foo.bar\n  at Baz.qux'
 * ```
 */
export function expandTabs(text: string): string {
  return text.replace(TAB_PATTERN, TAB_REPLACEMENT);
}
