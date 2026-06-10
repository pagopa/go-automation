import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import type { SENDNotifications } from '../../../SENDNotifications.js';
import {
  isSENDNotificationPollingTerminalError,
  SENDNotificationService,
} from '../../../services/notification/SENDNotificationService.js';
import type { SENDNotificationStatusResponse } from '../../../services/notification/models/SENDNotificationStatusResponse.js';
import { SENDNotificationStatus } from '../../../services/notification/models/SENDNotificationStatus.js';
import type { SENDNotificationRequest } from '../../../services/notification/models/SENDNotificationRequest.js';
import type { SENDNotificationRow } from '../SENDNotificationRow.js';
import type { SENDUploadedAttachment } from '../SENDUploadedAttachment.js';
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

function createAttachment(filePath: string, fileKey: string, pratica = 'PRA-001'): SENDUploadedAttachment {
  return {
    pratica,
    filePath,
    fileKey,
    versionToken: 'version-token',
    sha256: 'sha256-digest',
    contentType: 'application/pdf',
  };
}

/**
 * Creates an SDK mock that records the notification requests passed to sendNotification
 */
function createSendingSdk(sent: SENDNotificationRequest[]): SENDNotifications {
  const sendNotification = mock.fn(async (notification: SENDNotificationRequest) => {
    await Promise.resolve();
    sent.push(notification);
    return { notificationRequestId: 'request-1' };
  });
  return { notifications: { sendNotification } } as unknown as SENDNotifications;
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

  it('attaches all uploaded attachments of the pratica with sequential docIdx', async () => {
    const sent: SENDNotificationRequest[] = [];
    const processor = new SENDNotificationImportRowProcessor(createSendingSdk(sent));
    const attachmentsByPratica = new Map<string, ReadonlyArray<SENDUploadedAttachment>>([
      ['PRA-001', [createAttachment('/inputs/01.pdf', 'key-1'), createAttachment('/inputs/02.pdf', 'key-2')]],
    ]);
    // The row also has a documentKey reference: pratica must take precedence
    const row: SENDNotificationRow = { ...createRow(), pratica: 'PRA-001' };

    const result = await processor.processRow(row, { sendNotifications: true, attachmentsByPratica });

    const notification = sent[0];
    assert.strictEqual(notification?.documents.length, 2);
    assert.strictEqual(notification?.documents[0]?.ref.key, 'key-1');
    assert.strictEqual(notification?.documents[0]?.ref.versionToken, 'version-token');
    assert.strictEqual(notification?.documents[0]?.digests.sha256, 'sha256-digest');
    assert.strictEqual(notification?.documents[0]?.docIdx, '0');
    assert.strictEqual(notification?.documents[0]?.title, '01');
    assert.strictEqual(notification?.documents[1]?.ref.key, 'key-2');
    assert.strictEqual(notification?.documents[1]?.docIdx, '1');
    assert.strictEqual(result.docUploaded, false);
    assert.strictEqual(result.notificationResult?.notificationRequestId, 'request-1');
  });

  it('keeps single-document rows without docIdx', async () => {
    const sent: SENDNotificationRequest[] = [];
    const processor = new SENDNotificationImportRowProcessor(createSendingSdk(sent));

    await processor.processRow(createRow(), { sendNotifications: true });

    const notification = sent[0];
    assert.strictEqual(notification?.documents.length, 1);
    assert.strictEqual(notification?.documents[0]?.ref.key, 'safe-storage-key');
    assert.strictEqual(notification?.documents[0]?.docIdx, undefined);
  });

  it('fails when the pratica has no uploaded attachments', async () => {
    const processor = new SENDNotificationImportRowProcessor(createSendingSdk([]));
    const row: SENDNotificationRow = { ...createRow(), pratica: 'PRA-404' };

    await assert.rejects(
      processor.processRow(row, { attachmentsByPratica: new Map() }),
      /No uploaded attachments found for pratica "PRA-404"/,
    );
  });

  it('fails when the row has a pratica but no attachments map was provided', async () => {
    const processor = new SENDNotificationImportRowProcessor(createSendingSdk([]));
    const row: SENDNotificationRow = { ...createRow(), pratica: 'PRA-001' };

    await assert.rejects(processor.processRow(row, {}), /no attachments map was provided/);
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
  it('does not narrow malformed terminal polling errors', () => {
    assert.strictEqual(
      isSENDNotificationPollingTerminalError({
        name: 'SENDNotificationPollingTerminalError',
        notificationRequestId: 'request-1',
        terminalStatus: SENDNotificationStatus.REFUSED,
      }),
      false,
    );
    assert.strictEqual(
      isSENDNotificationPollingTerminalError({
        name: 'SENDNotificationPollingTerminalError',
        notificationRequestId: 'request-1',
        terminalStatus: SENDNotificationStatus.REFUSED,
        statusResponse: {},
      }),
      false,
    );
  });

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
