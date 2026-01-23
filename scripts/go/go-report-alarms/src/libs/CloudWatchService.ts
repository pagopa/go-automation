/**
 * CloudWatch Service - Handles CloudWatch API operations
 */

import {
  CloudWatchClient,
  DescribeAlarmHistoryCommand,
} from '@aws-sdk/client-cloudwatch';
import type {
  CloudWatchClientConfig,
  AlarmHistoryItem,
  DescribeAlarmHistoryCommandInput,
} from '@aws-sdk/client-cloudwatch';

/**
 * Service for interacting with AWS CloudWatch
 */
export class CloudWatchService {
  private client: CloudWatchClient;

  constructor(config: CloudWatchClientConfig) {
    this.client = new CloudWatchClient(config);
  }

  /**
   * Retrieve alarm history with pagination
   * @param startDate Start date for history (ISO 8601 format)
   * @param endDate End date for history (ISO 8601 format)
   * @param alarmName Optional alarm name filter
   * @returns Array of alarm history items
   * @throws Error if dates are invalid
   */
  async describeAlarmHistory(startDate: string, endDate: string, alarmName?: string): Promise<AlarmHistoryItem[]> {
    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
      throw new Error(`Invalid start date: ${startDate}`);
    }
    if (isNaN(end.getTime())) {
      throw new Error(`Invalid end date: ${endDate}`);
    }
    if (start > end) {
      throw new Error(`Start date (${startDate}) must be before end date (${endDate})`);
    }

    const input: DescribeAlarmHistoryCommandInput = {
      AlarmName: alarmName,
      HistoryItemType: 'StateUpdate',
      StartDate: start,
      EndDate: end,
      ScanBy: 'TimestampDescending',
      MaxRecords: 100, // Optimized: AWS supports up to 100 records per request
    };

    const result: AlarmHistoryItem[] = [];

    // Paginate through all results
    do {
      const command = new DescribeAlarmHistoryCommand(input);
      const { AlarmHistoryItems, NextToken } = await this.client.send(command);

      if (AlarmHistoryItems) {
        result.push(...AlarmHistoryItems);
      }

      input.NextToken = NextToken;
    } while (input.NextToken);

    return result;
  }

  /**
   * Close the CloudWatch client
   */
  async close(): Promise<void> {
    this.client.destroy();
  }
}
