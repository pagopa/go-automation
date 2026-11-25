import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { GOFileDownloader } from '../GOFileDownloader.js';
import { GOFileDownloaderError } from '../GOFileDownloaderError.js';
import { createTempDir } from '../../__tests__/helpers/createTempDir.js';
import type { TempDir } from '../../__tests__/helpers/TempDir.js';

/** Number of requests the test server received. */
interface CallCounter {
  calls: number;
}

describe('GOFileDownloader', () => {
  let server: http.Server;
  let baseUrl = '';
  let tmp: TempDir;
  /** Per-test request handler, swapped by each test. */
  let handler: http.RequestListener = (_req, res) => res.end();

  before(async () => {
    tmp = await createTempDir('downloader-');
    server = http.createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address !== null && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await tmp.cleanup();
  });

  /** Responds with `failures` failing responses, then 200 with `body`; returns the call counter. */
  function serve(
    failures: ReadonlyArray<{ status: number; headers?: Record<string, string> }>,
    body: string,
    successHeaders: Record<string, string> = {},
  ): CallCounter {
    const counter: CallCounter = { calls: 0 };
    handler = (_req, res) => {
      const failure = failures[counter.calls];
      counter.calls += 1;
      res.writeHead(failure?.status ?? 200, failure?.headers ?? successHeaders);
      res.end(failure === undefined ? body : 'failure');
    };
    return counter;
  }

  it('downloads atomically, overwriting the destination, and computes sha256', async () => {
    const payload = 'NEW CONTENT';
    serve([], payload, { 'content-type': 'application/octet-stream' });
    const dest = tmp.file('ok/out.bin');
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, 'OLD CONTENT');

    const result = await new GOFileDownloader({ maxRetries: 0 }).downloadToFile(`${baseUrl}/file.bin`, dest);

    assert.strictEqual(await fs.readFile(dest, 'utf8'), payload);
    assert.strictEqual(result.bytesWritten, Buffer.byteLength(payload));
    assert.strictEqual(result.sha256, createHash('sha256').update(payload).digest('hex'));
    assert.strictEqual(result.attempts, 1);
    assert.strictEqual(result.contentType, 'application/octet-stream');
    await assert.rejects(fs.access(`${dest}.partial`), 'no leftover partial file');
  });

  const retryCases = [
    { name: 'retries on 503 until success', failures: [{ status: 503 }, { status: 503 }], attempts: 3 },
    {
      name: 'respects Retry-After on 429',
      failures: [{ status: 429, headers: { 'retry-after': '0' } }],
      attempts: 2,
    },
  ];
  for (const { name, failures, attempts } of retryCases) {
    it(name, async () => {
      const counter = serve(failures, 'payload');
      const downloader = new GOFileDownloader({ maxRetries: 5, backoffBaseMs: 1, backoffJitterMs: 0 });
      const result = await downloader.downloadToFile(`${baseUrl}/x`, tmp.file(`retry-${String(attempts)}.bin`));
      assert.strictEqual(result.attempts, attempts);
      assert.strictEqual(counter.calls, attempts);
    });
  }

  it('throws GOFileDownloaderError on a permanent 404 without retrying or leaving a partial file', async () => {
    const counter = serve([{ status: 404 }], 'never');
    const dest = tmp.file('missing.bin');

    await assert.rejects(
      new GOFileDownloader({ maxRetries: 1 }).downloadToFile(`${baseUrl}/missing`, dest),
      (err) => err instanceof GOFileDownloaderError && err.statusCode === 404,
    );
    assert.strictEqual(counter.calls, 1);
    await assert.rejects(fs.access(`${dest}.partial`));
  });
});
