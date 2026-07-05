import { execFileSync } from 'node:child_process';

import type { AutomaticRunbookDescriptorV1 } from './external.js';

/** Loads descriptors through the go-analyze-alarm process boundary. */
export function loadRunbookDescriptors(): ReadonlyArray<AutomaticRunbookDescriptorV1> {
  const output = execFileSync(
    'pnpm',
    ['--silent', '--filter', 'go-analyze-alarm', 'exec', 'tsx', 'src/exportAutomaticRunbookDescriptors.ts'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed)) throw new Error('go-analyze-alarm did not return a descriptor array');
  return parsed as ReadonlyArray<AutomaticRunbookDescriptorV1>;
}
