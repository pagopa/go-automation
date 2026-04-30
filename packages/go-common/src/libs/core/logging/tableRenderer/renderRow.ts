import type { ResolvedColumn } from './ResolvedColumn.js';
import { padCell } from './padCell.js';
import { splitMultiline } from './splitMultiline.js';

/** Inner padding added on each side of every cell (1 space left + 1 space right) */
const INNER_PADDING = 2;

/**
 * Renders a logical row, which may span multiple visual lines if any
 * cell contains `\n`. All cells in the same row share the same height
 * (= max lines among the cells); shorter cells get empty padded lines
 * to keep vertical alignment.
 *
 * @param rawCells - Pre-formatted cell strings (one per column)
 * @param columns - Resolved column metadata (length must match rawCells)
 * @param vertical - Vertical separator character (may be empty for compact)
 * @returns The visual lines joined with `\n`
 */
export function renderRow(
  rawCells: ReadonlyArray<string>,
  columns: ReadonlyArray<ResolvedColumn>,
  vertical: string,
): string {
  if (columns.length === 0) return '';

  // Pre-pad each cell line-by-line. Each entry is the array of visual
  // lines for that cell, already padded to the column's inner width.
  const cellLines: ReadonlyArray<ReadonlyArray<string>> = columns.map((col, i) => {
    const innerWidth = col.width - INNER_PADDING;
    return splitMultiline(rawCells[i] ?? '', innerWidth, col.align);
  });

  const rowHeight = cellLines.reduce((max, lines) => Math.max(max, lines.length), 1);

  const visualLines: string[] = new Array<string>(rowHeight);
  for (let lineIdx = 0; lineIdx < rowHeight; lineIdx++) {
    const segments = columns.map((col, i) => {
      const innerWidth = col.width - INNER_PADDING;
      const line = cellLines[i]?.[lineIdx] ?? padCell('', innerWidth, col.align);
      return ` ${line} `;
    });

    if (vertical === '') {
      visualLines[lineIdx] = segments.join('').trimEnd();
    } else {
      visualLines[lineIdx] = vertical + segments.join(vertical) + vertical;
    }
  }

  return visualLines.join('\n');
}
