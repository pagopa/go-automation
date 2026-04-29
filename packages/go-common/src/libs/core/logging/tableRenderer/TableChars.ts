import type { BorderStyle } from './BorderStyle.js';

/**
 * Box-drawing characters for a table.
 *
 * Each character can be empty (e.g. compact mode disables every separator),
 * which the renderer interprets as "skip this border position".
 */
export interface TableChars {
  readonly topLeft: string;
  readonly topMid: string;
  readonly topRight: string;
  readonly midLeft: string;
  readonly midMid: string;
  readonly midRight: string;
  readonly bottomLeft: string;
  readonly bottomMid: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
}

const FULL_CHARS = {
  topLeft: '┌',
  topMid: '┬',
  topRight: '┐',
  midLeft: '├',
  midMid: '┼',
  midRight: '┤',
  bottomLeft: '└',
  bottomMid: '┴',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
} as const satisfies TableChars;

const BORDER_LESS_CHARS = {
  topLeft: '',
  topMid: '',
  topRight: '',
  midLeft: '',
  midMid: '┼',
  midRight: '',
  bottomLeft: '',
  bottomMid: '',
  bottomRight: '',
  horizontal: '─',
  vertical: '│',
} as const satisfies TableChars;

const COMPACT_CHARS = {
  topLeft: '',
  topMid: '',
  topRight: '',
  midLeft: '',
  midMid: '',
  midRight: '',
  bottomLeft: '',
  bottomMid: '',
  bottomRight: '',
  horizontal: '',
  vertical: ' ',
} as const satisfies TableChars;

/**
 * Lookup table from `BorderStyle` to its character set.
 *
 * Using `as const satisfies Record<BorderStyle, TableChars>` ensures:
 * - every `BorderStyle` has an entry (compile-time exhaustiveness)
 * - each entry conforms to `TableChars`
 * - literal types are preserved (e.g. `topLeft: '┌'` not widened to `string`)
 */
export const TABLE_CHARS_BY_STYLE: Readonly<Record<BorderStyle, TableChars>> = {
  full: FULL_CHARS,
  'border-less': BORDER_LESS_CHARS,
  compact: COMPACT_CHARS,
} as const satisfies Record<BorderStyle, TableChars>;
