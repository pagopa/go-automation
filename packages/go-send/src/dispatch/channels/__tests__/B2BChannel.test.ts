import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { SENDNotificationService } from '../../../services/notification/SENDNotificationService.js';
import { B2BChannel } from '../B2BChannel.js';

describe('B2BChannel', () => {
  it('delegates every call to SENDNotificationService with the API version', async () => {
    const calls: string[] = [];
    const service = {
      sendNotification: async (_request: unknown, version: string) => {
        await Promise.resolve();
        calls.push(`send ${version}`);
        return { notificationRequestId: 'N', paProtocolNumber: 'P' };
      },
      getNotificationRequestStatus: async (id: string, version: string) => {
        await Promise.resolve();
        calls.push(`status ${id} ${version}`);
        return { notificationRequestId: id, notificationRequestStatus: 'ACCEPTED' };
      },
      getNotificationStatusByProtocol: async (protocol: string, token: string, version: string) => {
        await Promise.resolve();
        calls.push(`lookup ${protocol} ${token} ${version}`);
        return { notificationRequestId: 'N', notificationRequestStatus: 'WAITING' };
      },
      getGroups: async (metadataOnly: boolean) => {
        await Promise.resolve();
        calls.push(`groups ${String(metadataOnly)}`);
        return [{ id: 'g', name: 'G', status: 'ACTIVE' }];
      },
    } as unknown as SENDNotificationService;

    const channel = new B2BChannel(service);
    await channel.send({} as never, 'v2.6');
    await channel.status('N', 'v2.6');
    await channel.lookup('P', 'T', 'v2.6');
    assert.deepEqual(await channel.groups(), [{ id: 'g', name: 'G', status: 'ACTIVE' }]);
    assert.deepEqual(calls, ['send v2.6', 'status N v2.6', 'lookup P T v2.6', 'groups true']);
  });
});
