import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { SENDNotificationService } from '../SENDNotificationService.js';

describe('SENDNotificationService', () => {
  it('aborts status checks and protocol lookups through the request options', async () => {
    const urls: string[] = [];
    let onBothArrived: () => void = () => {};
    const bothArrived = new Promise<void>((resolve) => {
      onBothArrived = resolve;
    });
    // A server that never answers: only the abort can end the requests.
    const server = createServer((request) => {
      urls.push(request.url ?? '');
      if (urls.length === 2) onBothArrived();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const service = new SENDNotificationService({
        basePath: `http://127.0.0.1:${port}`,
        apiKey: 'k',
        timeout: 30_000,
      });
      const controller = new AbortController();
      const status = service.getNotificationRequestStatus('N', 'v2.6', { signal: controller.signal });
      const lookup = service.getNotificationStatusByProtocol('P', 'T', 'v2.6', { signal: controller.signal });
      // Abort only once both requests reached the server: a fixed delay races
      // with the connection under load and the URLs would never be recorded.
      await bothArrived;
      const started = Date.now();
      controller.abort();
      await assert.rejects(status);
      await assert.rejects(lookup);
      assert.ok(Date.now() - started < 10_000, 'ended by the abort, not by the timeout');
      assert.ok(urls.some((url) => url.includes('notificationRequestId=N')));
      assert.ok(urls.some((url) => url.includes('paProtocolNumber=P')));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
