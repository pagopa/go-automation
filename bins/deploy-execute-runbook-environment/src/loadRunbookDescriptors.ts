import { execFileSync } from 'node:child_process';

import type { AutomaticRunbookDescriptorV1 } from './external.js';

/** Loads descriptors directly from the source catalog. */
export function loadRunbookDescriptors(): ReadonlyArray<AutomaticRunbookDescriptorV1> {
  const output = execFileSync('pnpm', ['--silent', '--filter', '@go-automation/go-runbook', 'catalog:descriptors'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed)) throw new Error('go-runbook did not return a descriptor array');
  return parsed as ReadonlyArray<AutomaticRunbookDescriptorV1>;
}
