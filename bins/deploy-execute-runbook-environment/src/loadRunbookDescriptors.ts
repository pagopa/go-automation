import { execFileSync } from 'node:child_process';

import type { AutomaticRunbookDescriptorV1, RunbookDescriptor } from './external.js';

/** Loads descriptors directly from the source catalog. */
export function loadRunbookDescriptors(): ReadonlyArray<AutomaticRunbookDescriptorV1> {
  const output = execFileSync('pnpm', ['--silent', '--filter', '@go-automation/go-runbook', 'catalog:descriptors'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed)) throw new Error('go-runbook did not return a descriptor array');
  // go-runbook declares its own descriptor shape and does not depend on the
  // contracts package. Returning the source shape as the wire shape is what
  // ties them: a field renamed on either side stops this from compiling,
  // instead of publishing a catalog the consumer cannot read. The values
  // themselves are checked at publish time by `validateAutomaticRunbookCatalog`.
  const descriptors = parsed as ReadonlyArray<RunbookDescriptor>;
  return descriptors;
}
