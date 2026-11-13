import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Packs a package exactly as `pnpm publish` would (running `prepack`) and extracts the archive.
 *
 * @param packageDirectory - Directory of the package to pack
 * @param workDirectory - Empty scratch directory owned by the caller
 * @returns The directory holding the extracted archive content (the archive's `package/`)
 * @throws Error when packing or extracting fails, or the archive is not where expected
 */
export async function packPackage(packageDirectory: string, workDirectory: string): Promise<string> {
  const archives = path.join(workDirectory, 'archives');
  const extracted = path.join(workDirectory, 'extracted');
  await fs.mkdir(archives, { recursive: true });
  await fs.mkdir(extracted, { recursive: true });
  execFileSync('pnpm', ['pack', '--pack-destination', archives], {
    cwd: packageDirectory,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const tarballs = (await fs.readdir(archives)).filter((name) => name.endsWith('.tgz'));
  const [tarball] = tarballs;
  if (tarball === undefined || tarballs.length !== 1) {
    throw new Error(`pnpm pack produced ${String(tarballs.length)} archives in ${archives}, expected 1`);
  }
  execFileSync('tar', ['-xzf', path.join(archives, tarball), '-C', extracted], { stdio: 'inherit' });
  return path.join(extracted, 'package');
}
