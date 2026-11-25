import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { TestContext } from 'node:test';

/**
 * Creates a temporary directory removed when the test ends.
 *
 * @param t - Context of the running test, which owns the cleanup
 * @returns Absolute path of the new directory
 */
export async function makeTempDir(t: TestContext): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-script-provider-'));
  t.after(async () => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
