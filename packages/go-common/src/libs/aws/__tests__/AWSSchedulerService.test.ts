import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GetScheduleCommand } from '@aws-sdk/client-scheduler';
import type { SchedulerClient } from '@aws-sdk/client-scheduler';

import { AWSSchedulerService } from '../AWSSchedulerService.js';

describe('AWSSchedulerService', () => {
  it('should call GetScheduleCommand with the correct rule name', async () => {
    const mockClient = {
      send: async (command: GetScheduleCommand) => {
        assert.ok(command instanceof GetScheduleCommand);
        assert.strictEqual(command.input.Name, 'my-scheduled-rule');
        return {
          Name: 'my-scheduled-rule',
          ScheduleExpression: 'rate(5 minutes)',
          State: 'ENABLED',
        };
      },
    } as unknown as SchedulerClient;

    const service = new AWSSchedulerService(mockClient);
    const result = await service.getSchedule('my-scheduled-rule');

    assert.strictEqual(result.Name, 'my-scheduled-rule');
    assert.strictEqual(result.ScheduleExpression, 'rate(5 minutes)');
    assert.strictEqual(result.State, 'ENABLED');
  });
});
