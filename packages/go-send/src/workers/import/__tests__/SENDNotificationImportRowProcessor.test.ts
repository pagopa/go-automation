import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import type { SENDNotifications } from '../../../SENDNotifications.js';
import {
  isSENDNotificationPollingTerminalError,
  SENDNotificationService,
} from '../../../services/notification/SENDNotificationService.js';
import type { SENDNotificationStatusResponse } from '../../../services/notification/models/SENDNotificationStatusResponse.js';
import { SENDNotificationStatus } from '../../../services/notification/models/SENDNotificationStatus.js';
import type { SENDNotificationRow } from '../SENDNotificationRow.js';
import { SENDNotificationImportRowProcessor } from '../SENDNotificationImportRowProcessor.js';
import type { SENDNotificationImportWorkerNotificationDiscardedEvent } from '../SENDNotificationImportWorkerEvents.js';

function createRow(): SENDNotificationRow {
  return {
    subject: 'Verifica input alias',
    senderTaxId: '12345678901',
    senderDenomination: 'PagoPA',
    recipientTaxId: 'RSSMRA80A01H501U',
    recipientType: 'PF',
    recipientDenomination: 'Mario Rossi',
    physicalAddress: 'Via Roma 1',
    physicalZip: '00100',
    physicalMunicipality: 'Roma',
    documentTitle: 'Documento',
    documentKey: 'safe-storage-key',
    documentVersionToken: 'version-token',
    documentSha256: 'sha256',
  };
}

function createTerminalError(statusResponse: SENDNotificationStatusResponse): Error {
  const error = new Error(`Notification request-1 reached terminal status ${statusResponse.notificationRequestStatus}`);
  Object.defineProperties(error, {
    name: { value: 'SENDNotificationPollingTerminalError' },
    notificationRequestId: { value: statusResponse.notificationRequestId },
    terminalStatus: { value: statusResponse.notificationRequestStatus },
    statusResponse: { value: statusResponse },
  });
  return error;
}

describe('SENDNotificationImportRowProcessor', () => {
  it('discards REFUSED notifications without failing the row', async () => {
    const refusedStatus: SENDNotificationStatusResponse = {
      notificationRequestId: 'request-1',
      notificationRequestStatus: SENDNotificationStatus.REFUSED,
      errors: [{ code: 'NOT_VALID_ADDRESS', detail: 'Address declared non-mailable by normalizer' }],
    };
    const sendNotification = mock.fn(async (): Promise<{ notificationRequestId: string }> => {
      await Promise.resolve();
      return { notificationRequestId: 'request-1' };
    });
    const pollForIun = mock.fn(async (): Promise<string> => {
      await Promise.resolve();
      throw createTerminalError(refusedStatus);
    });
    const sdk = {
      notifications: { sendNotification, pollForIun },
    } as unknown as SENDNotifications;
    const processor = new SENDNotificationImportRowProcessor(sdk);
    const discardedEvents: SENDNotificationImportWorkerNotificationDiscardedEvent[] = [];
    processor.on('worker:notification:discarded', (event) => {
      discardedEvents.push(event);
    });

    const result = await processor.processRow(createRow(), {
      sendNotifications: true,
      pollForIun: true,
      pollMaxAttempts: 100,
      pollDelayMs: 30000,
    });

    assert.strictEqual(sendNotification.mock.callCount(), 1);
    assert.strictEqual(pollForIun.mock.callCount(), 1);
    assert.strictEqual(result.notificationResult?.notificationRequestId, 'request-1');
    assert.strictEqual(result.notificationResult?.iun, undefined);
    assert.strictEqual(result.notificationResult?.discarded?.status, SENDNotificationStatus.REFUSED);
    assert.strictEqual(discardedEvents.length, 1);
    assert.strictEqual(discardedEvents[0]?.status, SENDNotificationStatus.REFUSED);
    assert.strictEqual(discardedEvents[0]?.notificationRequestId, 'request-1');
  });

  it('keeps non-terminal polling errors as failures', async () => {
    const sendNotification = mock.fn(async (): Promise<{ notificationRequestId: string }> => {
      await Promise.resolve();
      return { notificationRequestId: 'request-1' };
    });
    const pollForIun = mock.fn(async (): Promise<string> => {
      await Promise.resolve();
      throw new Error('network timeout');
    });
    const sdk = {
      notifications: { sendNotification, pollForIun },
    } as unknown as SENDNotifications;
    const processor = new SENDNotificationImportRowProcessor(sdk);

    await assert.rejects(
      processor.processRow(createRow(), {
        sendNotifications: true,
        pollForIun: true,
      }),
      /network timeout/,
    );
  });
});

describe('SENDNotificationService.pollForIun', () => {
  it('stops immediately when PN returns REFUSED without IUN', async () => {
    const service = new SENDNotificationService({ basePath: 'https://example.invalid', apiKey: 'api-key' });
    const get = mock.fn(async (): Promise<SENDNotificationStatusResponse> => {
      await Promise.resolve();
      return {
        notificationRequestId: 'request-1',
        notificationRequestStatus: SENDNotificationStatus.REFUSED,
        errors: [{ code: 'NOT_VALID_ADDRESS', detail: 'Address declared non-mailable by normalizer' }],
      };
    });
    (service as unknown as { httpClient: { get: typeof get } }).httpClient = { get };

    await assert.rejects(service.pollForIun('request-1', { maxAttempts: 3, delayMs: 1 }), (error: unknown): boolean => {
      assert.ok(isSENDNotificationPollingTerminalError(error));
      assert.strictEqual(error.terminalStatus, SENDNotificationStatus.REFUSED);
      return true;
    });
    assert.strictEqual(get.mock.callCount(), 1);
  });
});
