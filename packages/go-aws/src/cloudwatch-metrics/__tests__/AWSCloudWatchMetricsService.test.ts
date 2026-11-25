import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GetMetricDataCommand, type CloudWatchClient } from '@aws-sdk/client-cloudwatch';

import { FakeAwsClient } from '../../__tests__/helpers/FakeAwsClient.js';
import { AWSCloudWatchMetricsService } from '../AWSCloudWatchMetricsService.js';

describe('AWSCloudWatchMetricsService', () => {
  it('maps CloudWatch metric timestamps and values to datapoints', async () => {
    const timestamp = new Date('2026-05-18T10:00:00.000Z');
    const client = new FakeAwsClient([{ MetricDataResults: [{ Timestamps: [timestamp], Values: [42] }] }]);

    const results = await new AWSCloudWatchMetricsService(client.as<CloudWatchClient>()).getMetricData(
      'AWS/ApiGateway',
      '5XXError',
      [{ name: 'ApiName', value: 'pn-api' }],
      { start: new Date('2026-05-18T09:00:00.000Z'), end: new Date('2026-05-18T11:00:00.000Z') },
      60,
      'Sum',
    );

    assert.deepStrictEqual(results, [{ timestamp, value: 42 }]);
    assert.strictEqual(client.sent(GetMetricDataCommand).length, 1);
  });
});
