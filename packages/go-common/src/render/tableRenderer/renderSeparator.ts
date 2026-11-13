import type { ResolvedColumn } from './ResolvedColumn.js';
import type { TableChars } from './TableChars.js';

/** Position of a horizontal separator in the table */
type SeparatorPosition = 'top' | 'mid' | 'bottom';

/**
 * Builds a horizontal separator line for the given border position.
 *
 * Returns empty string when chars for the position are empty:
 * - `compact` style: every position empty → no separator at all
 * - `border-less` style: no `top`/`bottom` (header `mid` stays)
 *
 * @param columns - Resolved columns providing per-column widths
 * @param chars - Character set for the active border style
 * @param position - Which border line to render
 */
export function renderSeparator(
  columns: ReadonlyArray<ResolvedColumn>,
  chars: TableChars,
  position: SeparatorPosition,
): string {
  if (columns.length === 0) return '';

  const [left, mid, right] = positionChars(chars, position);
  // Position is "disabled" when all three border characters for this position
  // are empty. The `horizontal` field stays usable elsewhere (e.g. mid in
  // border-less style uses horizontal but suppresses left/right corners).
  if (left === '' && mid === '' && right === '') {
    return '';
  }

  const segments = columns.map((col) => chars.horizontal.repeat(col.width));
  return left + segments.join(mid) + right;
}

function positionChars(chars: TableChars, pos: SeparatorPosition): readonly [string, string, string] {
  switch (pos) {
    case 'top':
      return [chars.topLeft, chars.topMid, chars.topRight];
    case 'mid':
      return [chars.midLeft, chars.midMid, chars.midRight];
    case 'bottom':
      return [chars.bottomLeft, chars.bottomMid, chars.bottomRight];
    default: {
      const exhaustive: never = pos;
      throw new Error(`Unhandled separator position: ${String(exhaustive)}`);
    }
  }
}
