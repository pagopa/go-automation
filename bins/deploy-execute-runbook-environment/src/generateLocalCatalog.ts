import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { serializeCatalog } from './catalog.js';
import { loadRunbookDescriptors } from './loadRunbookDescriptors.js';
import { buildLocalCatalog, createLocalCatalogOutputPath, parseLocalCatalogOptions } from './localCatalog.js';

async function main(): Promise<void> {
  const options = parseLocalCatalogOptions(process.argv.slice(2));
  const sourceRevision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const catalog = buildLocalCatalog({
    options,
    sourceRevision,
    runbooks: loadRunbookDescriptors(),
  });
  const output = await createLocalCatalogOutputPath(options.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serializeCatalog(catalog), { encoding: 'utf8', mode: 0o600 });
  console.log(
    JSON.stringify(
      {
        status: 'GENERATED',
        output,
        environment: catalog.environment,
        revision: catalog.revision,
        artifactRevision: catalog.worker.artifactRevision,
        runbooks: catalog.runbooks.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
