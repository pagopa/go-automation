import { GetScheduleCommand, ListSchedulesCommand, UpdateScheduleCommand } from '@aws-sdk/client-scheduler';
import type {
  GetScheduleCommandOutput,
  ScheduleState,
  ScheduleSummary,
  SchedulerClient,
} from '@aws-sdk/client-scheduler';

/**
 * Optional filters accepted by {@link AWSSchedulerService.listSchedules}.
 *
 * All filters are applied server-side by EventBridge Scheduler.
 */
export interface AWSScheduleListFilters {
  /** Only list schedules belonging to this schedule group */
  readonly groupName?: string;

  /** Only list schedules whose name starts with this prefix */
  readonly namePrefix?: string;

  /** Only list schedules currently in this state */
  readonly state?: ScheduleState;
}

/**
 * Outcome of {@link AWSSchedulerService.setScheduleState}.
 *
 * Carries both states so callers can report the transition without issuing a
 * second `GetSchedule` call.
 */
export interface AWSScheduleStateChange {
  /** State the schedule had before the call (undefined if the API omitted it) */
  readonly previousState: ScheduleState | undefined;

  /** State the schedule has after the call */
  readonly currentState: ScheduleState;

  /** ARN of the schedule */
  readonly scheduleArn: string | undefined;

  /** True when the schedule was already in the requested state and nothing was updated */
  readonly unchanged: boolean;
}

/**
 * Service for interacting with Amazon EventBridge Scheduler.
 *
 * Provides methods to list schedules, retrieve schedule details, and toggle the
 * enabled/disabled state of a single schedule.
 */
export class AWSSchedulerService {
  constructor(private readonly client: SchedulerClient) {}

  /**
   * Retrieves the details of a scheduled rule.
   *
   * @param name - The name of the scheduled rule
   * @param groupName - Optional schedule group; the API assumes `default` when omitted
   * @returns Detailed schedule information
   */
  async getSchedule(name: string, groupName?: string): Promise<GetScheduleCommandOutput> {
    // GroupName is spread conditionally instead of assigned: sending it as an
    // explicit `undefined` is not equivalent to omitting it for every caller.
    const command = new GetScheduleCommand({
      Name: name,
      ...(groupName !== undefined ? { GroupName: groupName } : {}),
    });
    const response = await this.client.send(command);
    return response;
  }

  /**
   * Lists every schedule matching the given filters, following pagination to
   * exhaustion.
   *
   * `MaxResults` is deliberately not exposed: the API caps it at 100 and the
   * pagination loop below already walks the full result set.
   *
   * @param filters - Optional server-side filters (group, name prefix, state)
   * @returns All matching schedule summaries, in the order returned by the API
   */
  async listSchedules(filters?: AWSScheduleListFilters): Promise<ScheduleSummary[]> {
    const baseInput = {
      ...(filters?.groupName !== undefined ? { GroupName: filters.groupName } : {}),
      ...(filters?.namePrefix !== undefined ? { NamePrefix: filters.namePrefix } : {}),
      ...(filters?.state !== undefined ? { State: filters.state } : {}),
    };

    const schedules: ScheduleSummary[] = [];
    let nextToken: string | undefined;

    do {
      const command = new ListSchedulesCommand({
        ...baseInput,
        ...(nextToken !== undefined ? { NextToken: nextToken } : {}),
      });
      const response = await this.client.send(command);

      schedules.push(...(response.Schedules ?? []));
      nextToken = response.NextToken;
    } while (nextToken !== undefined);

    return schedules;
  }

  /**
   * Enables or disables a single schedule.
   *
   * `UpdateSchedule` is a **full replacement**: EventBridge Scheduler uses all
   * values in the request and resets every field left out to its system default.
   * Sending just `{ Name, State }` would therefore wipe `Description`, `Target`,
   * `RetryPolicy`, `StartDate`, `KmsKeyArn` and friends. The schedule is read
   * first and every writable field is sent back verbatim, with only `State`
   * changed. Read-only fields (`Arn`, `CreationDate`, `LastModificationDate`)
   * are mapped out explicitly rather than stripped via rest-destructuring, so
   * the preserved set stays documented and a new read-only field in the SDK
   * cannot silently leak into the request.
   *
   * No update is issued when the schedule is already in the requested state.
   *
   * @param name - The name of the schedule
   * @param state - Desired state (`ENABLED` or `DISABLED`)
   * @param groupName - Optional schedule group; the API assumes `default` when omitted
   * @returns The transition outcome, flagged as `unchanged` when it was a no-op
   */
  async setScheduleState(name: string, state: ScheduleState, groupName?: string): Promise<AWSScheduleStateChange> {
    const current = await this.getSchedule(name, groupName);

    if (current.State === state) {
      return {
        previousState: current.State,
        currentState: state,
        scheduleArn: current.Arn,
        unchanged: true,
      };
    }

    const command = new UpdateScheduleCommand({
      Name: current.Name ?? name,
      GroupName: current.GroupName ?? groupName,
      ScheduleExpression: current.ScheduleExpression,
      ScheduleExpressionTimezone: current.ScheduleExpressionTimezone,
      StartDate: current.StartDate,
      EndDate: current.EndDate,
      FlexibleTimeWindow: current.FlexibleTimeWindow,
      Target: current.Target,
      Description: current.Description,
      KmsKeyArn: current.KmsKeyArn,
      ActionAfterCompletion: current.ActionAfterCompletion,
      State: state,
    });
    const response = await this.client.send(command);

    return {
      previousState: current.State,
      currentState: state,
      scheduleArn: response.ScheduleArn ?? current.Arn,
      unchanged: false,
    };
  }
}
