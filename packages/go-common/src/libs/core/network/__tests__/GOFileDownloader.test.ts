import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { GOFileDownloader } from '../GOFileDownloader.js';
import { GOFileDownloaderError } from '../GOFileDownloaderError.js';

interface ServerHandle {
  readonly server: http.Server;
  readonly url: string;
}

async function startServer(handler: http.RequestListener): Promise<ServerHandle> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('failed to start test server');
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function makeTempFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'downloader-'));
  return path.join(dir, 'out.bin');
}

describe('GOFileDownloader', () => {
  it('downloads and computes sha256', async () => {
    const payload = Buffer.from('hello world');
    const handle = await startServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/octet-stream');
      res.end(payload);
    });

    try {
      const dest = await makeTempFile();
      const downloader = new GOFileDownloader({ maxRetries: 0 });
      const result = await downloader.downloadToFile(`${handle.url}/file.bin`, dest);
      const written = await fs.readFile(dest);
      assert.deepStrictEqual(written, payload);
      assert.strictEqual(result.bytesWritten, payload.byteLength);
      assert.strictEqual(result.sha256, createHash('sha256').update(payload).digest('hex'));
      assert.strictEqual(result.attempts, 1);
    } finally {
      handle.server.close();
    }
  });

  it('retries on 503 and succeeds', async () => {
    let calls = 0;
    const handle = await startServer((_req, res) => {
      calls += 1;
      if (calls < 3) {
        res.statusCode = 503;
        res.end('try again');
        return;
      }
      res.statusCode = 200;
      res.end('payload');
    });
    try {
      const dest = await makeTempFile();
      const downloader = new GOFileDownloader({ maxRetries: 5, backoffBaseMs: 1, backoffJitterMs: 0 });
      const result = await downloader.downloadToFile(`${handle.url}/x`, dest);
      assert.strictEqual(result.attempts, 3);
      assert.strictEqual(calls, 3);
    } finally {
      handle.server.close();
    }
  });

  it('respects Retry-After on 429', async () => {
    let calls = 0;
    const handle = await startServer((_req, res) => {
      calls += 1;
      if (calls === 1) {
        res.statusCode = 429;
        res.setHeader('retry-after', '0');
        res.end('rate-limited');
        return;
      }
      res.statusCode = 200;
      res.end('ok');
    });
    try {
      const dest = await makeTempFile();
      const downloader = new GOFileDownloader({ maxRetries: 2, backoffBaseMs: 1, backoffJitterMs: 0 });
      const result = await downloader.downloadToFile(`${handle.url}/y`, dest);
      assert.strictEqual(result.attempts, 2);
    } finally {
      handle.server.close();
    }
  });

  it('throws GOFileDownloaderError on permanent 404', async () => {
    const handle = await startServer((_req, res) => {
      res.statusCode = 404;
      res.end('not found');
    });
    try {
      const dest = await makeTempFile();
      const downloader = new GOFileDownloader({ maxRetries: 1 });
      await assert.rejects(
        downloader.downloadToFile(`${handle.url}/missing`, dest),
        (err) => err instanceof GOFileDownloaderError && err.statusCode === 404,
      );
    } finally {
      handle.server.close();
    }
  });

  it('atomic write: no leftover partial file on success', async () => {
    const handle = await startServer((_req, res) => {
      res.statusCode = 200;
      res.end('clean');
    });
    try {
      const dest = await makeTempFile();
      const downloader = new GOFileDownloader({ maxRetries: 0 });
      await downloader.downloadToFile(`${handle.url}/x`, dest);
      const partial = `${dest}.partial`;
      await assert.rejects(fs.access(partial));
    } finally {
      handle.server.close();
    }
  });

  it('does not leave partial file after failure', async () => {
    const handle = await startServer((_req, res) => {
      res.statusCode = 404;
      res.end('nope');
    });
    try {
      const dest = await makeTempFile();
      const downloader = new GOFileDownloader({ maxRetries: 0 });
      await assert.rejects(downloader.downloadToFile(`${handle.url}/missing`, dest));
      await assert.rejects(fs.access(`${dest}.partial`));
    } finally {
      handle.server.close();
    }
  });
});
