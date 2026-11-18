import type { GOLogger } from '@pagopa/go-common/logging';

import { ConsoleRunbookReporter } from '../../engine/reporting/ConsoleRunbookReporter.js';
import type { CapturedNarrative } from './CapturedNarrative.js';

/**
 * Creates a console reporter over a logger stand-in that records `text()` and
 * `newline()`, so a test can read the rendered narrative.
 *
 * @returns The reporter and the lines it wrote
 */
export function captureNarrative(): CapturedNarrative {
  const lines: string[] = [];
  // Safe: the console reporter calls only text() and newline().
  const logger = {
    text: (line: string): void => {
      lines.push(line);
    },
    newline: (): void => {
      lines.push('');
    },
  } as unknown as GOLogger;
  return { reporter: new ConsoleRunbookReporter(logger), lines };
}
