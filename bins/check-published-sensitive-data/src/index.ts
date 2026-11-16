import * as path from 'node:path';

import { checkPackedArchives, checkPublishedSources } from './checkPublished.js';
import { formatFinding } from './formatFinding.js';
import { listPublishedPackages } from './listPublishedPackages.js';
import { loadSensitiveDataConfig } from './loadSensitiveDataConfig.js';

/** Default configuration, at the repository root (EVO-AWSACCT-OPUS-01 §9). */
const DEFAULT_CONFIG = 'published-sensitive-data.config.json';

function optionValue(argv: ReadonlyArray<string>, option: string): string | undefined {
  const index = argv.indexOf(option);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const root = path.resolve(optionValue(argv, '--root') ?? process.cwd());
  const config = await loadSensitiveDataConfig(path.resolve(root, optionValue(argv, '--config') ?? DEFAULT_CONFIG));
  const sources = argv.includes('--sources');
  const packages = await listPublishedPackages(root);
  if (packages.length === 0) {
    console.error('No published package (@pagopa/*, not private) under packages/.');
    return 2;
  }

  const findings = sources
    ? await checkPublishedSources(packages, config)
    : await checkPackedArchives(packages, config);
  const kind = sources ? 'sources (G-pub-2)' : 'packed archives (G-pub-1)';
  if (findings.length === 0) {
    console.log(`Published ${kind}: no sensitive data in ${packages.map((item) => item.name).join(', ')}.`);
    return 0;
  }
  console.error(`Published ${kind}: ${String(findings.length)} finding(s) (EVO-AWSACCT-OPUS-01 §9).`);
  for (const { scope, finding } of findings) console.error(`- ${formatFinding(scope, finding)}`);
  console.error('Use a logical account and a synthetic id, or add a reasoned exception to the configuration.');
  return 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
