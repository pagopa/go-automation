import { after, before, describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GOBinaryFileExporter } from '../../../exporters/binary/GOBinaryFileExporter.js';
import { GOBinaryFileImporter } from '../GOBinaryFileImporter.js';
import { GOFileTooLargeError } from '../GOFileTooLargeError.js';
import { GOPathOutsideRootError } from '../GOPathOutsideRootError.js';

let tmpDir = '';
let probeFile = '';
let fileCounter = 0;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-binary-importer-'));
  probeFile = path.join(tmpDir, 'probe.bin');
  await new GOBinaryFileExporter({ outputPath: probeFile }).export(Buffer.alloc(1));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function tempFile(name: string): string {
  fileCounter += 1;
  return path.join(tmpDir, `${fileCounter}-${name}`);
}

/** Shared prototype of every `FileHandle`, read from a short-lived handle. */
async function fileHandlePrototype(): Promise<FileHandle> {
  const probe = await fs.open(probeFile, 'r');
  await probe.close();
  // Type assertion: the prototype of a FileHandle exposes the FileHandle methods
  return Object.getPrototypeOf(probe) as FileHandle;
}

/** Predicate accepted by `assert.rejects`. */
type ErrorPredicate = (error: unknown) => boolean;

/** Returns the handles streamed from so far. */
type StreamedHandlesFn = () => FileHandle[];

/**
 * Spies on `FileHandle.createReadStream()` (the original still runs) and
 * returns a getter of the handles the importer streamed from.
 */
async function trackStreamedHandles(t: TestContext): Promise<StreamedHandlesFn> {
  const proto = await fileHandlePrototype();
  const spy = t.mock.method(proto, 'createReadStream');
  // Type assertion: the spied method is only ever called on FileHandle instances
  return () => spy.mock.calls.map((call) => call.this as FileHandle);
}

/**
 * Resolves once `handle` is closed. `FileHandle.close()` sets `fd` to -1
 * synchronously, so polling it is reliable; a leaked handle never resolves
 * and the test times out.
 */
async function waitClosed(handle: FileHandle | undefined): Promise<void> {
  assert.ok(handle !== undefined, 'a handle was opened');
  while (handle.fd !== -1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

/**
 * Makes `FileHandle.stat()` report `size` bytes, simulating a file that grows
 * after the size check. Returns the handles `stat()` was called on.
 */
async function underReportSize(t: TestContext, size: number): Promise<FileHandle[]> {
  const proto = await fileHandlePrototype();
  const handles: FileHandle[] = [];
  // Only `size` is read by the importer: a partial Stats is enough.
  t.mock.method(proto, 'stat', async function (this: FileHandle): Promise<{ readonly size: number }> {
    handles.push(this);
    return Promise.resolve({ size });
  });
  return handles;
}

function isTooLarge(size: number, maxBytes: number): ErrorPredicate {
  return (error: unknown) => error instanceof GOFileTooLargeError && error.size === size && error.maxBytes === maxBytes;
}

describe('GOBinaryFileImporter', () => {
  it('reads the bytes written by GOBinaryFileExporter', async () => {
    const file = tempFile('data.bin');
    const content = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    await new GOBinaryFileExporter({ outputPath: file }).export(content);
    assert.deepEqual(await new GOBinaryFileImporter({ inputPath: file }).import(), content);
    assert.deepEqual(await new GOBinaryFileImporter({ inputPath: file, maxBytes: 6 }).import(), content);
  });

  it('returns undefined for a missing optional file and throws otherwise', async () => {
    const missing = tempFile('missing.bin');
    assert.equal(await new GOBinaryFileImporter({ inputPath: missing, optional: true }).import(), undefined);
    assert.equal(
      await new GOBinaryFileImporter({ inputPath: missing, optional: true, maxBytes: 1 }).import(),
      undefined,
    );
    await assert.rejects(new GOBinaryFileImporter({ inputPath: missing }).import(), /ENOENT/);
  });

  it('refuses a file larger than maxBytes without reading it, closing the handle', async (t) => {
    const file = tempFile('big.bin');
    await new GOBinaryFileExporter({ outputPath: file }).export(Buffer.alloc(10));
    const statted = await underReportSize(t, 10);
    const streamed = await trackStreamedHandles(t);

    await assert.rejects(new GOBinaryFileImporter({ inputPath: file, maxBytes: 9 }).import(), isTooLarge(10, 9));
    assert.equal(streamed().length, 0, 'nothing was read');
    assert.equal(statted.length, 1);
    assert.equal(statted[0]?.fd, -1, 'the handle was closed');
    assert.equal((await new GOBinaryFileImporter({ inputPath: file, maxBytes: 10 }).import())?.length, 10);
  });

  it('stops at maxBytes when the file grows after the size check', { timeout: 5_000 }, async (t) => {
    const file = tempFile('growing.bin');
    await new GOBinaryFileExporter({ outputPath: file }).export(Buffer.alloc(200 * 1024));
    await underReportSize(t, 1024); // the check sees 1 KiB, the read finds 200 KiB
    const streamed = await trackStreamedHandles(t);

    await assert.rejects(
      new GOBinaryFileImporter({ inputPath: file, maxBytes: 100 * 1024 }).import(),
      (error: unknown) => error instanceof GOFileTooLargeError && error.size > 100 * 1024,
    );
    assert.equal(streamed().length, 1);
    await waitClosed(streamed()[0]);
  });
});

async function collect(importer: GOBinaryFileImporter): Promise<ReadonlyArray<Buffer>> {
  const chunks: Buffer[] = [];
  for await (const chunk of importer.importStream()) chunks.push(chunk);
  return chunks;
}

describe('GOBinaryFileImporter.importStream', () => {
  it('yields the content in chunks, in order', async () => {
    const file = tempFile('large.bin');
    // Larger than the 64 KiB read buffer: more than one chunk.
    const content = Buffer.alloc(200 * 1024, 0);
    for (let i = 0; i < content.length; i++) content[i] = i % 251;
    await new GOBinaryFileExporter({ outputPath: file }).export(content);

    const chunks = await collect(new GOBinaryFileImporter({ inputPath: file }));
    assert.ok(chunks.length > 1, `chunks: ${chunks.length}`);
    assert.deepEqual(Buffer.concat(chunks), content);

    const hash = createHash('sha256');
    for await (const chunk of new GOBinaryFileImporter({ inputPath: file }).importStream()) hash.update(chunk);
    assert.equal(hash.digest('hex'), createHash('sha256').update(content).digest('hex'));
  });

  it('yields nothing for an empty file', async () => {
    const file = tempFile('empty.bin');
    await new GOBinaryFileExporter({ outputPath: file }).export(Buffer.alloc(0));
    assert.equal(Buffer.concat(await collect(new GOBinaryFileImporter({ inputPath: file }))).length, 0);
  });

  it('yields nothing for a missing optional file and throws otherwise', async () => {
    const missing = tempFile('missing.bin');
    assert.deepEqual(await collect(new GOBinaryFileImporter({ inputPath: missing, optional: true })), []);
    await assert.rejects(collect(new GOBinaryFileImporter({ inputPath: missing })), /ENOENT/);
  });

  it('refuses a file larger than maxBytes before the first chunk', async () => {
    const file = tempFile('big.bin');
    await new GOBinaryFileExporter({ outputPath: file }).export(Buffer.alloc(10));
    await assert.rejects(collect(new GOBinaryFileImporter({ inputPath: file, maxBytes: 9 })), isTooLarge(10, 9));
    assert.equal(Buffer.concat(await collect(new GOBinaryFileImporter({ inputPath: file, maxBytes: 10 }))).length, 10);
  });

  it('stops at maxBytes when the file grows after the size check', { timeout: 5_000 }, async (t) => {
    const file = tempFile('growing.bin');
    await new GOBinaryFileExporter({ outputPath: file }).export(Buffer.alloc(200 * 1024));
    await underReportSize(t, 1024);
    const streamed = await trackStreamedHandles(t);

    let yielded = 0;
    await assert.rejects(
      (async (): Promise<void> => {
        for await (const chunk of new GOBinaryFileImporter({ inputPath: file, maxBytes: 100 * 1024 }).importStream()) {
          yielded += chunk.length;
        }
      })(),
      (error: unknown) =>
        error instanceof GOFileTooLargeError && error.size > 100 * 1024 && error.maxBytes === 100 * 1024,
    );
    assert.ok(yielded <= 100 * 1024, `yielded ${yielded} bytes`);
    assert.equal(streamed().length, 1);
    await waitClosed(streamed()[0]); // the file is closed after the error
  });

  it('closes the file when the iteration stops early', { timeout: 5_000 }, async (t) => {
    const file = tempFile('early.bin');
    await new GOBinaryFileExporter({ outputPath: file }).export(Buffer.alloc(200 * 1024));
    const streamed = await trackStreamedHandles(t);

    for await (const chunk of new GOBinaryFileImporter({ inputPath: file }).importStream()) {
      assert.ok(chunk.length > 0);
      break;
    }

    assert.equal(streamed().length, 1);
    await waitClosed(streamed()[0]);
  });
});

describe('GOBinaryFileImporter confineTo', () => {
  it('reads a file inside the directory and rejects ../ and symlinks escaping it', async () => {
    const root = path.join(tmpDir, 'confined');
    const inside = path.join(root, 'sub', 'atto.pdf');
    const outside = tempFile('secret.pdf');
    await new GOBinaryFileExporter({ outputPath: inside }).export(Buffer.from('in'));
    await new GOBinaryFileExporter({ outputPath: outside }).export(Buffer.from('out'));
    const link = path.join(root, 'link.pdf');
    await fs.symlink(outside, link);

    const read = async (inputPath: string): Promise<Buffer | undefined> =>
      new GOBinaryFileImporter({ inputPath, confineTo: root }).import();
    assert.equal((await read(inside))?.toString(), 'in');
    await assert.rejects(read(path.join(root, '..', path.basename(outside))), GOPathOutsideRootError);
    await assert.rejects(read(link), (error: unknown) => {
      return error instanceof GOPathOutsideRootError && error.realPath.endsWith(path.basename(outside));
    });
    await assert.rejects(
      collect(new GOBinaryFileImporter({ inputPath: link, confineTo: root })),
      GOPathOutsideRootError,
    );
  });

  it('keeps optional semantics for a missing file inside the directory', async () => {
    const root = path.join(tmpDir, 'confined-missing');
    await fs.mkdir(root, { recursive: true });
    const missing = path.join(root, 'missing.pdf');
    assert.equal(
      await new GOBinaryFileImporter({ inputPath: missing, confineTo: root, optional: true }).import(),
      undefined,
    );
    await assert.rejects(new GOBinaryFileImporter({ inputPath: missing, confineTo: root }).import(), /ENOENT/);
  });
});
