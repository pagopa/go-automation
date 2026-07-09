import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { buildCatalog } from './catalog.js';
import type { AutomaticRunbookCatalogV1, AutomaticRunbookDescriptorV1 } from './external.js';

export interface LocalCatalogOptions {
  readonly environment: string;
  readonly output?: string;
  readonly changeNote: string;
  readonly artifactRevision?: string;
}

export function parseLocalCatalogOptions(args: ReadonlyArray<string>): LocalCatalogOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!name?.startsWith('--')) throw new Error(`Unexpected argument: ${name ?? ''}`);
    if (!['--environment', '--output', '--change-note', '--artifact-revision'].includes(name)) {
      throw new Error(`Unknown option: ${name}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    if (values.has(name)) throw new Error(`Duplicate option: ${name}`);
    values.set(name, value.trim());
    index += 1;
  }

  const environment = values.get('--environment') ?? 'development';
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(environment)) {
    throw new Error('--environment is invalid');
  }
  const outputValue = values.get('--output');
  if (outputValue === '') throw new Error('--output cannot be empty');
  const output = outputValue === undefined ? undefined : resolve(outputValue);
  const changeNote = values.get('--change-note') ?? 'Local development catalog';
  const artifactRevision = values.get('--artifact-revision');
  if (changeNote.trim() === '') throw new Error('--change-note cannot be empty');
  if (artifactRevision?.trim() === '') {
    throw new Error('--artifact-revision cannot be empty');
  }
  return {
    environment,
    changeNote,
    ...(output === undefined ? {} : { output }),
    ...(artifactRevision === undefined ? {} : { artifactRevision }),
  };
}

/** Creates a private, unique temporary directory when no explicit output path was requested. */
export async function createLocalCatalogOutputPath(output: string | undefined): Promise<string> {
  if (output !== undefined) return output;
  const directory = await mkdtemp(join(tmpdir(), 'go-automatic-runbook-catalog-'));
  return join(directory, 'catalog.json');
}

export function buildLocalCatalog(input: {
  readonly options: LocalCatalogOptions;
  readonly sourceRevision: string;
  readonly runbooks: ReadonlyArray<AutomaticRunbookDescriptorV1>;
  readonly publishedAt?: string;
}): AutomaticRunbookCatalogV1 {
  return buildCatalog({
    environment: input.options.environment,
    artifactRevision: input.options.artifactRevision ?? `local-${input.sourceRevision}`,
    actorArn: 'local-development',
    changeNote: input.options.changeNote,
    ...(input.publishedAt === undefined ? {} : { publishedAt: input.publishedAt }),
    runbooks: input.runbooks,
  });
}
