/**
 * Text utilities for the (assisted, lexical) V2 comparison.
 */

/** Lowercase, strip accents (combining diacritics U+0300–U+036F), collapse whitespace. */
export function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Tokenizes normalized text into alphanumeric tokens (length ≥ 2), keeping
 * technical tokens like `504` or `econnreset`.
 */
function tokenize(text: string): ReadonlyArray<string> {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

/**
 * Sørensen–Dice coefficient over the unique-token sets of two texts (0..1).
 * Used as a soft "description overlap" similarity.
 */
export function tokenDice(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return (2 * intersection) / (setA.size + setB.size);
}
