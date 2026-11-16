import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import type { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

import { AWSCloudWatchMetricsService } from '../AWSCloudWatchMetricsService.js';

interface FakeCloudWatchClient {
  readonly commands: GetMetricDataCommand[];
  send(command: GetMetricDataCommand): Promise<{
    readonly MetricDataResults: ReadonlyArray<{
      readonly Timestamps: ReadonlyArray<Date>;
      readonly Values: ReadonlyArray<number>;
    }>;
  }>;
}

function asCloudWatchClient(client: FakeCloudWatchClient): CloudWatchClient {
  return client as unknown as CloudWatchClient;
}

describe('AWSCloudWatchMetricsService', () => {
  it('maps CloudWatch metric timestamps and values to datapoints', async () => {
    const timestamp = new Date('2026-05-18T10:00:00.000Z');
    const fakeClient: FakeCloudWatchClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {
          MetricDataResults: [
            {
              Timestamps: [timestamp],
              Values: [42],
            },
          ],
        };
      },
    };

    const service = new AWSCloudWatchMetricsService(asCloudWatchClient(fakeClient));

    const results = await service.getMetricData(
      'AWS/ApiGateway',
      '5XXError',
      [{ name: 'ApiName', value: 'pn-api' }],
      { start: new Date('2026-05-18T09:00:00.000Z'), end: new Date('2026-05-18T11:00:00.000Z') },
      60,
      'Sum',
    );

    assert.deepStrictEqual(results, [{ timestamp, value: 42 }]);
    assert.strictEqual(fakeClient.commands.length, 1);
    assert.ok(fakeClient.commands[0] instanceof GetMetricDataCommand);
  });
});
