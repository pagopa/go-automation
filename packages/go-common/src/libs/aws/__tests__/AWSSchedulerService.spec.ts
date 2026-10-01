/**
 * Test di AWSSchedulerService.
 *
 * La suite preesistente `AWSSchedulerService.test.ts` gira sul runner nativo di
 * Node e copre il solo `getSchedule` originale: resta intatta. Qui si coprono
 * le estensioni (gruppo opzionale, paginazione, cambio di stato) su vitest.
 */

import {
  GetScheduleCommand,
  ListSchedulesCommand,
  UpdateScheduleCommand,
  type GetScheduleCommandOutput,
  type ListSchedulesCommandOutput,
  type SchedulerClient,
  type UpdateScheduleCommandOutput,
} from '@aws-sdk/client-scheduler';
import { describe, expect, it } from 'vitest';

import { AWSSchedulerService } from '../AWSSchedulerService.js';

type SchedulerCommand = GetScheduleCommand | ListSchedulesCommand | UpdateScheduleCommand;

/** Records every command sent and replies with the queued responses. */
function createMockClient(responses: ReadonlyArray<unknown>): {
  readonly client: SchedulerClient;
  readonly sent: SchedulerCommand[];
} {
  const sent: SchedulerCommand[] = [];
  let callIndex = 0;

  const client = {
    send: async (command: SchedulerCommand): Promise<unknown> => {
      sent.push(command);
      const response = responses[callIndex];
      callIndex += 1;
      return await Promise.resolve(response ?? {});
    },
  } as unknown as SchedulerClient;

  return { client, sent };
}

/** A fully populated schedule: every field here must survive an enable/disable. */
const FULL_SCHEDULE: GetScheduleCommandOutput = {
  $metadata: { httpStatusCode: 200 },
  Arn: 'arn:aws:scheduler:eu-south-1:123456789012:schedule/default/nightly-job',
  Name: 'nightly-job',
  GroupName: 'default',
  ScheduleExpression: 'cron(0 2 * * ? *)',
  ScheduleExpressionTimezone: 'Europe/Rome',
  StartDate: new Date('2026-01-01T00:00:00.000Z'),
  EndDate: new Date('2026-12-31T23:59:59.000Z'),
  Description: 'Nightly reconciliation job',
  State: 'ENABLED',
  CreationDate: new Date('2025-06-01T10:00:00.000Z'),
  LastModificationDate: new Date('2025-09-15T08:30:00.000Z'),
  KmsKeyArn: 'arn:aws:kms:eu-south-1:123456789012:key/abcd-1234',
  ActionAfterCompletion: 'NONE',
  FlexibleTimeWindow: { Mode: 'FLEXIBLE', MaximumWindowInMinutes: 15 },
  Target: {
    Arn: 'arn:aws:lambda:eu-south-1:123456789012:function:reconcile',
    RoleArn: 'arn:aws:iam::123456789012:role/scheduler-invoke',
    Input: '{"mode":"full"}',
    RetryPolicy: { MaximumRetryAttempts: 3, MaximumEventAgeInSeconds: 3600 },
    DeadLetterConfig: { Arn: 'arn:aws:sqs:eu-south-1:123456789012:scheduler-dlq' },
  },
};

describe('AWSSchedulerService.getSchedule', () => {
  it('sends the schedule name and no GroupName when the group is omitted', async () => {
    const { client, sent } = createMockClient([FULL_SCHEDULE]);
    const service = new AWSSchedulerService(client);

    const result = await service.getSchedule('nightly-job');

    expect(sent).toHaveLength(1);
    const [command] = sent;
    expect(command).toBeInstanceOf(GetScheduleCommand);
    expect(command?.input).toEqual({ Name: 'nightly-job' });
    // The key must be absent, not present with an undefined value.
    expect(command !== undefined && 'GroupName' in command.input).toBe(false);
    expect(result.Name).toBe('nightly-job');
  });

  it('forwards the group name when provided', async () => {
    const { client, sent } = createMockClient([FULL_SCHEDULE]);
    const service = new AWSSchedulerService(client);

    await service.getSchedule('nightly-job', 'batch-group');

    expect(sent[0]?.input).toEqual({ Name: 'nightly-job', GroupName: 'batch-group' });
  });
});

describe('AWSSchedulerService.listSchedules', () => {
  it('follows pagination and concatenates every page', async () => {
    const page1: ListSchedulesCommandOutput = {
      $metadata: {},
      Schedules: [{ Name: 'a' }, { Name: 'b' }],
      NextToken: 'token-page-2',
    };
    const page2: ListSchedulesCommandOutput = {
      $metadata: {},
      Schedules: [{ Name: 'c' }],
    };
    const { client, sent } = createMockClient([page1, page2]);
    const service = new AWSSchedulerService(client);

    const result = await service.listSchedules();

    expect(result.map((schedule) => schedule.Name)).toEqual(['a', 'b', 'c']);
    expect(sent).toHaveLength(2);
    expect(sent[0]?.input).toEqual({});
    expect(sent[1]?.input).toEqual({ NextToken: 'token-page-2' });
  });

  it('propagates the group, prefix and state filters', async () => {
    const { client, sent } = createMockClient([{ $metadata: {}, Schedules: [] }]);
    const service = new AWSSchedulerService(client);

    await service.listSchedules({ groupName: 'batch-group', namePrefix: 'nightly', state: 'DISABLED' });

    expect(sent[0]).toBeInstanceOf(ListSchedulesCommand);
    expect(sent[0]?.input).toEqual({
      GroupName: 'batch-group',
      NamePrefix: 'nightly',
      State: 'DISABLED',
    });
  });

  it('tolerates a page without a Schedules array', async () => {
    const { client } = createMockClient([{ $metadata: {} }]);
    const service = new AWSSchedulerService(client);

    await expect(service.listSchedules()).resolves.toEqual([]);
  });
});

describe('AWSSchedulerService.setScheduleState', () => {
  it('re-sends every writable field so the full replacement preserves the schedule', async () => {
    const updateResponse: UpdateScheduleCommandOutput = {
      $metadata: {},
      ScheduleArn: FULL_SCHEDULE.Arn,
    };
    const { client, sent } = createMockClient([FULL_SCHEDULE, updateResponse]);
    const service = new AWSSchedulerService(client);

    const result = await service.setScheduleState('nightly-job', 'DISABLED');

    expect(sent).toHaveLength(2);
    const update = sent[1];
    expect(update).toBeInstanceOf(UpdateScheduleCommand);

    const input = update?.input as Record<string, unknown> | undefined;
    expect(input).toBeDefined();

    // Only State changes; everything else is echoed back verbatim.
    expect(input?.['State']).toBe('DISABLED');
    expect(input?.['Name']).toBe(FULL_SCHEDULE.Name);
    expect(input?.['GroupName']).toBe(FULL_SCHEDULE.GroupName);
    expect(input?.['ScheduleExpression']).toBe(FULL_SCHEDULE.ScheduleExpression);
    expect(input?.['ScheduleExpressionTimezone']).toBe(FULL_SCHEDULE.ScheduleExpressionTimezone);
    expect(input?.['StartDate']).toEqual(FULL_SCHEDULE.StartDate);
    expect(input?.['EndDate']).toEqual(FULL_SCHEDULE.EndDate);
    expect(input?.['Description']).toBe(FULL_SCHEDULE.Description);
    expect(input?.['KmsKeyArn']).toBe(FULL_SCHEDULE.KmsKeyArn);
    expect(input?.['ActionAfterCompletion']).toBe(FULL_SCHEDULE.ActionAfterCompletion);
    expect(input?.['FlexibleTimeWindow']).toEqual(FULL_SCHEDULE.FlexibleTimeWindow);
    expect(input?.['Target']).toEqual(FULL_SCHEDULE.Target);

    // Read-only fields must never be part of the update request.
    for (const readOnlyField of ['Arn', 'CreationDate', 'LastModificationDate', '$metadata']) {
      expect(input !== undefined && readOnlyField in input).toBe(false);
    }

    expect(result).toEqual({
      previousState: 'ENABLED',
      currentState: 'DISABLED',
      scheduleArn: FULL_SCHEDULE.Arn,
      unchanged: false,
    });
  });

  it('falls back to the requested name and group when the API omits them', async () => {
    const { client, sent } = createMockClient([
      { $metadata: {}, State: 'DISABLED', ScheduleExpression: 'rate(5 minutes)' },
      { $metadata: {}, ScheduleArn: 'arn:aws:scheduler:eu-south-1:123456789012:schedule/g/s' },
    ]);
    const service = new AWSSchedulerService(client);

    await service.setScheduleState('orphan-job', 'ENABLED', 'batch-group');

    const input = sent[1]?.input as Record<string, unknown> | undefined;
    expect(input?.['Name']).toBe('orphan-job');
    expect(input?.['GroupName']).toBe('batch-group');
  });

  it('is a no-op when the schedule is already in the requested state', async () => {
    const { client, sent } = createMockClient([FULL_SCHEDULE]);
    const service = new AWSSchedulerService(client);

    const result = await service.setScheduleState('nightly-job', 'ENABLED');

    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(GetScheduleCommand);
    expect(result).toEqual({
      previousState: 'ENABLED',
      currentState: 'ENABLED',
      scheduleArn: FULL_SCHEDULE.Arn,
      unchanged: true,
    });
  });
});
