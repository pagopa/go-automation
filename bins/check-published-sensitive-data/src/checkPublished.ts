import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { packPackage } from './packPackage.js';
import { compileScanRules } from './scanText.js';
import { scanTree } from './scanTree.js';
import type { PublishedPackage } from './types/PublishedPackage.js';
import type { ScopedFinding } from './types/ScopedFinding.js';
import type { SensitiveDataConfig } from './types/SensitiveDataConfig.js';

/** Source paths the sources check skips: tests and baselines are never published. */
const NOT_PUBLISHED_SOURCE = /(?:(?:^|\/)(?:__tests__|__baseline__)(?:\/|$))|(?:\.test\.ts$)/u;

/** Package-root documents the sources check reads besides `src/`. */
const PACKAGE_DOCUMENTS: ReadonlyArray<string> = ['README.md', 'CHANGELOG.md'];

/**
 * G-pub-1: packs every published package (running `prepack`), extracts the archive and
 * scans every shipped text file and the entry list.
 *
 * @param packages - Published packages
 * @param config - Gate configuration
 * @returns The findings of every package
 */
export async function checkPackedArchives(
  packages: ReadonlyArray<PublishedPackage>,
  config: SensitiveDataConfig,
): Promise<ReadonlyArray<ScopedFinding>> {
  const findings: ScopedFinding[] = [];
  for (const published of packages) {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'published-sensitive-data-'));
    try {
      const rules = compileScanRules(config, published.name);
      const root = await packPackage(published.directory, work);
      const scope = `${published.name} (archive)`;
      const scanned = await scanTree(root, {
        rules,
        forbiddenPathSegments: config.forbiddenPathSegments,
        forbiddenSuffixes: config.forbiddenSuffixes,
      });
      findings.push(...scanned.map((finding) => ({ scope, finding })));
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }
  return findings;
}

/**
 * G-pub-2: scans `src/**` (tests and baselines excluded) and the package documents of
 * every published package, without building or packing.
 *
 * @param packages - Published packages
 * @param config - Gate configuration
 * @returns The findings of every package
 */
export async function checkPublishedSources(
  packages: ReadonlyArray<PublishedPackage>,
  config: SensitiveDataConfig,
): Promise<ReadonlyArray<ScopedFinding>> {
  const findings: ScopedFinding[] = [];
  for (const published of packages) {
    const rules = compileScanRules(config, published.name);
    const scope = `${published.name} (sources)`;
    const scanned = await scanTree(published.directory, {
      rules,
      forbiddenPathSegments: [],
      forbiddenSuffixes: [],
      skip: (relativePath) => !isPublishedSource(relativePath),
    });
    findings.push(...scanned.map((finding) => ({ scope, finding })));
  }
  return findings;
}

function isPublishedSource(relativePath: string): boolean {
  if (PACKAGE_DOCUMENTS.includes(relativePath)) return true;
  return relativePath.startsWith('src/') && !NOT_PUBLISHED_SOURCE.test(relativePath);
}
