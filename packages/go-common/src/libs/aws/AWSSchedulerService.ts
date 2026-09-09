import { GetScheduleCommand } from '@aws-sdk/client-scheduler';
import type { GetScheduleCommandOutput, SchedulerClient } from '@aws-sdk/client-scheduler';

/**
 * Service for interacting with Amazon EventBridge Scheduler.
 *
 * Provides methods to retrieve schedule details.
 */
export class AWSSchedulerService {
  constructor(private readonly client: SchedulerClient) {}

  /**
   * Retrieves the details of a scheduled rule.
   *
   * @param name - The name of the scheduled rule
   * @returns Detailed schedule information
   */
  async getSchedule(name: string): Promise<GetScheduleCommandOutput> {
    const command = new GetScheduleCommand({ Name: name });
    const response = await this.client.send(command);
    return response;
  }
}
