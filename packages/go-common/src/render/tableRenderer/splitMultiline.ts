import { padCell } from './padCell.js';

/**
 * Splits a cell value on `\n` and pads/truncates each line to exactly
 * `innerWidth` display columns according to `align`.
 *
 * Returns at least one line. The renderer uses the result to determine
 * the row's visual height (`max(lines.length)` across cells) and pads
 * shorter cells with empty lines.
 *
 * @param text - Cell content; may contain `\n` for multi-line cells
 * @param innerWidth - Target width for each line (column width minus padding)
 * @param align - Alignment applied to every line
 */
export function splitMultiline(
  text: string,
  innerWidth: number,
  align: 'left' | 'right' | 'center',
): ReadonlyArray<string> {
  const rawLines = text.split('\n');
  const padded: string[] = new Array<string>(rawLines.length);
  for (let i = 0; i < rawLines.length; i++) {
    padded[i] = padCell(rawLines[i] ?? '', innerWidth, align);
  }
  return padded;
}
