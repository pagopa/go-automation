import { readFile } from 'node:fs/promises';

import type { ExecuteRunbookQueueRegistryFragmentV1 } from './registry/publishQueueRegistry.js';
import { composeQueueRegistry, publishQueueRegistry } from './registry/publishQueueRegistry.js';

const expectedRegions = required('EXECUTE_RUNBOOK_REGIONS')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const fragmentPaths = required('EXECUTE_RUNBOOK_REGISTRY_FRAGMENTS')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const parameterName = required('EXECUTE_RUNBOOK_QUEUE_REGISTRY_PARAMETER');

const fragments = await Promise.all(
  fragmentPaths.map(async (path) => JSON.parse(await readFile(path, 'utf8')) as ExecuteRunbookQueueRegistryFragmentV1),
);
const registry = composeQueueRegistry(expectedRegions, fragments, new Date().toISOString());
await publishQueueRegistry(parameterName, registry);
process.stdout.write(`${JSON.stringify({ parameterName, revision: registry.revision, regions: expectedRegions })}\n`);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') throw new Error(`Missing required environment variable ${name}`);
  return value;
}
