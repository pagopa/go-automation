import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { TestContext } from 'node:test';

/**
 * Writes `content` to `fileName` inside a fresh temporary directory, removed when
 * the test ends.
 *
 * @param t - Context of the running test, which owns the cleanup
 * @param fileName - Name of the file, extension included
 * @param content - Bytes or UTF-8 text to write
 * @returns Absolute path of the written file
 */
export async function writeTempFile(t: TestContext, fileName: string, content: string | Buffer): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-documents-test-'));
  t.after(async () => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, fileName);
  await fs.writeFile(file, content);
  return file;
}
