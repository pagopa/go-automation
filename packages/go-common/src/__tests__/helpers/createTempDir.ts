import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach } from 'node:test';

import type { TempDir } from './TempDir.js';

/**
 * Creates a fresh directory under the OS temp dir.
 *
 * @param prefix - Directory name prefix (e.g. `'go-csv-importer-'`)
 * @returns The created directory; the caller must `cleanup()` it
 */
export async function createTempDir(prefix: string): Promise<TempDir> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    path: dir,
    file: (...segments) => path.join(dir, ...segments),
    write: async (relativePath, content) => {
      const filePath = path.join(dir, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);
      return filePath;
    },
    cleanup: async () => fs.rm(dir, { recursive: true, force: true }),
  };
}

/**
 * Gives every test of the enclosing `describe` its own temp directory,
 * created in `beforeEach` and removed in `afterEach`.
 * Must be called inside a `describe` block, never at module top level
 * (top-level hooks would apply to every file when tests share one process).
 *
 * @param prefix - Directory name prefix
 * @returns A handle whose `path`/`file()` refer to the current test's directory
 */
export function useTempDir(prefix: string): TempDir {
  let current: TempDir | undefined;
  const active = (): TempDir => {
    if (current === undefined) throw new Error('useTempDir: no temp dir outside a running test');
    return current;
  };

  beforeEach(async () => {
    current = await createTempDir(prefix);
  });
  afterEach(async () => {
    await current?.cleanup();
    current = undefined;
  });

  return {
    get path(): string {
      return active().path;
    },
    file: (...segments) => active().file(...segments),
    write: async (relativePath, content) => active().write(relativePath, content),
    cleanup: async () => active().cleanup(),
  };
}
