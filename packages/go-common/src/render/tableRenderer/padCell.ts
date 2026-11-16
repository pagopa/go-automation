import { displayWidth } from './displayWidth.js';

const ELLIPSIS = '…';

/**
 * Returns `text` padded or truncated to exactly `width` display columns,
 * aligned according to `align`. ANSI-aware via `displayWidth`.
 *
 * - shorter than width → pad with spaces according to `align`
 * - longer than width  → truncate iterating code points and append `…`
 * - width <= 0         → empty string
 *
 * NOTE: `text` is assumed to be single-line (no `\n`). Multi-line cells
 * are handled by `splitMultiline` which delegates each line here.
 */
export function padCell(text: string, width: number, align: 'left' | 'right' | 'center'): string {
  if (width <= 0) return '';

  const cells = displayWidth(text);
  if (cells === width) return text;

  if (cells > width) {
    return truncateToWidth(text, width);
  }

  const pad = width - cells;
  switch (align) {
    case 'left':
      return text + ' '.repeat(pad);
    case 'right':
      return ' '.repeat(pad) + text;
    case 'center': {
      const left = Math.floor(pad / 2);
      const right = pad - left;
      return ' '.repeat(left) + text + ' '.repeat(right);
    }
    default: {
      const exhaustive: never = align;
      throw new Error(`Unhandled align: ${String(exhaustive)}`);
    }
  }
}

/**
 * Truncates a string to fit exactly `width` cells, replacing the last
 * cell with an ellipsis (`…`). Iterates code points (NOT UTF-16 code
 * units) to avoid splitting surrogate pairs or grapheme clusters.
 */
function truncateToWidth(text: string, width: number): string {
  if (width === 1) return ELLIPSIS;

  let result = '';
  let used = 0;
  const target = width - 1; // reserve last cell for ellipsis

  for (const ch of text) {
    const w = displayWidth(ch);
    if (used + w > target) break;
    result += ch;
    used += w;
  }

  // Pad with spaces if we landed on a wide-char boundary that left a gap
  return result + ' '.repeat(target - used) + ELLIPSIS;
}
