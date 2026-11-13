/** Shortest repeated pattern length considered a cycle. */
const MIN_CYCLE_LENGTH = 2;

/** Longest repeated pattern length scanned. */
const MAX_CYCLE_LENGTH = 20;

/** Number of consecutive repetitions required to confirm a cycle. */
const REQUIRED_REPETITIONS = 3;

/**
 * Detects a runtime cycle in the tail of a visited-step sequence.
 *
 * Scans candidate pattern lengths from {@link MIN_CYCLE_LENGTH} to
 * {@link MAX_CYCLE_LENGTH}; a pattern is confirmed a cycle only when it
 * repeats {@link REQUIRED_REPETITIONS} times back-to-back at the end of
 * the sequence (so a step legitimately revisited once or twice does not
 * trip the guard).
 *
 * @param visitedSequence - Sequence of visited step IDs, in execution order.
 * @returns `true` when a confirmed cycle is found.
 */
export function detectRuntimeCycle(visitedSequence: ReadonlyArray<string>): boolean {
  const len = visitedSequence.length;

  for (let cycleLen = MIN_CYCLE_LENGTH; cycleLen <= MAX_CYCLE_LENGTH; cycleLen++) {
    const requiredLength = cycleLen * REQUIRED_REPETITIONS;
    if (len < requiredLength) {
      continue;
    }

    const offset = len - requiredLength;
    let isCycle = true;

    for (let i = 0; i < cycleLen; i++) {
      const first = visitedSequence[offset + i];
      const second = visitedSequence[offset + i + cycleLen];
      const third = visitedSequence[offset + i + cycleLen * 2];
      if (first !== second || second !== third) {
        isCycle = false;
        break;
      }
    }

    if (isCycle) {
      return true;
    }
  }

  return false;
}
