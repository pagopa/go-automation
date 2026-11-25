/**
 * String Distance Utilities
 *
 * Provides string similarity algorithms for "did you mean?" suggestions.
 * Uses the Damerau-Levenshtein distance which counts transpositions as a
 * single edit operation, making it ideal for detecting CLI flag typos.
 */

/**
 * Calculates the Damerau-Levenshtein distance between two strings.
 * This metric counts the minimum number of operations (insertions, deletions,
 * substitutions, and transpositions of adjacent characters) required to
 * transform one string into another.
 *
 * Complexity: O(m * n) time and space where m and n are string lengths
 *
 * @param source - The source string
 * @param target - The target string
 * @returns The edit distance (0 = identical)
 *
 * @example
 * ```typescript
 * damerauLevenshteinDistance('start-date', 'strat-date'); // 1 (transposition)
 * damerauLevenshteinDistance('aws-profile', 'aws-proflie'); // 1 (transposition)
 * damerauLevenshteinDistance('start-date', 'end-date');     // 5
 * ```
 */
export function damerauLevenshteinDistance(source: string, target: string): number {
  const sourceLen = source.length;
  const targetLen = target.length;

  if (source === target) return 0;
  if (sourceLen === 0) return targetLen;
  if (targetLen === 0) return sourceLen;

  // Flat array avoids nested indexing issues with noUncheckedIndexedAccess.
  // The ?? 0 fallback is never triggered because the matrix is fully pre-initialized.
  const width = targetLen + 1;
  const matrix = new Array<number>((sourceLen + 1) * width).fill(0);
  const at = (i: number, j: number): number => matrix[i * width + j] ?? 0;

  // Initialize first column and first row
  for (let i = 0; i <= sourceLen; i++) {
    matrix[i * width] = i;
  }
  for (let j = 0; j <= targetLen; j++) {
    matrix[j] = j;
  }

  for (let i = 1; i <= sourceLen; i++) {
    for (let j = 1; j <= targetLen; j++) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;

      const deletion = at(i - 1, j) + 1;
      const insertion = at(i, j - 1) + 1;
      const substitution = at(i - 1, j - 1) + cost;

      let minDistance = Math.min(deletion, insertion, substitution);

      // Transposition: swap of two adjacent characters
      if (i > 1 && j > 1 && source[i - 1] === target[j - 2] && source[i - 2] === target[j - 1]) {
        const transposition = at(i - 2, j - 2) + cost;
        minDistance = Math.min(minDistance, transposition);
      }

      matrix[i * width + j] = minDistance;
    }
  }

  return at(sourceLen, targetLen);
}
