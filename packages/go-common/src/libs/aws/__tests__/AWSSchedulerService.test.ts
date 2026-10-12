/**
 * Test di AWSSchedulerService: `getSchedule`, la paginazione di `listSchedules`
 * e la sostituzione integrale di `setScheduleState`.
 *
 * Il seam è il `SchedulerClient`, così il service reale viene esercitato e un
 * test può asserire l'input esatto dei comandi inviati.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GetScheduleCommand,
  ListSchedulesCommand,
  UpdateScheduleCommand,
  type GetScheduleCommandOutput,
  type ListSchedulesCommandOutput,
  type SchedulerClient,
  type UpdateScheduleCommandOutput,
} from '@aws-sdk/client-scheduler';

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
  it('returns the schedule the API answered with', async () => {
    const { client, sent } = createMockClient([
      { Name: 'my-scheduled-rule', ScheduleExpression: 'rate(5 minutes)', State: 'ENABLED' },
    ]);
    const service = new AWSSchedulerService(client);

    const result = await service.getSchedule('my-scheduled-rule');

    assert.ok(sent[0] instanceof GetScheduleCommand);
    assert.equal(sent[0]?.input.Name, 'my-scheduled-rule');
    assert.equal(result.Name, 'my-scheduled-rule');
    assert.equal(result.ScheduleExpression, 'rate(5 minutes)');
    assert.equal(result.State, 'ENABLED');
  });

  it('sends the schedule name and no GroupName when the group is omitted', async () => {
    const { client, sent } = createMockClient([FULL_SCHEDULE]);
    const service = new AWSSchedulerService(client);

    const result = await service.getSchedule('nightly-job');

    assert.equal(sent.length, 1);
    const [command] = sent;
    assert.ok(command instanceof GetScheduleCommand);
    assert.deepEqual(command?.input, { Name: 'nightly-job' });
    // The key must be absent, not present with an undefined value.
    assert.equal(command !== undefined && 'GroupName' in command.input, false);
    assert.equal(result.Name, 'nightly-job');
  });

  it('forwards the group name when provided', async () => {
    const { client, sent } = createMockClient([FULL_SCHEDULE]);
    const service = new AWSSchedulerService(client);

    await service.getSchedule('nightly-job', 'batch-group');

    assert.deepEqual(sent[0]?.input, { Name: 'nightly-job', GroupName: 'batch-group' });
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

    assert.deepEqual(
      result.map((schedule) => schedule.Name),
      ['a', 'b', 'c'],
    );
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[0]?.input, {});
    assert.deepEqual(sent[1]?.input, { NextToken: 'token-page-2' });
  });

  it('propagates the group, prefix and state filters', async () => {
    const { client, sent } = createMockClient([{ $metadata: {}, Schedules: [] }]);
    const service = new AWSSchedulerService(client);

    await service.listSchedules({ groupName: 'batch-group', namePrefix: 'nightly', state: 'DISABLED' });

    assert.ok(sent[0] instanceof ListSchedulesCommand);
    assert.deepEqual(sent[0]?.input, {
      GroupName: 'batch-group',
      NamePrefix: 'nightly',
      State: 'DISABLED',
    });
  });

  it('tolerates a page without a Schedules array', async () => {
    const { client } = createMockClient([{ $metadata: {} }]);
    const service = new AWSSchedulerService(client);

    assert.deepEqual(await service.listSchedules(), []);
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

    assert.equal(sent.length, 2);
    const update = sent[1];
    assert.ok(update instanceof UpdateScheduleCommand);

    // `assert.ok` above narrows `update`, so its input no longer overlaps a
    // plain record: the `in` checks below need the untyped view.
    const input = update?.input as unknown as Record<string, unknown> | undefined;
    assert.ok(input !== undefined);

    // Only State changes; everything else is echoed back verbatim.
    assert.equal(input?.['State'], 'DISABLED');
    assert.equal(input?.['Name'], FULL_SCHEDULE.Name);
    assert.equal(input?.['GroupName'], FULL_SCHEDULE.GroupName);
    assert.equal(input?.['ScheduleExpression'], FULL_SCHEDULE.ScheduleExpression);
    assert.equal(input?.['ScheduleExpressionTimezone'], FULL_SCHEDULE.ScheduleExpressionTimezone);
    assert.deepEqual(input?.['StartDate'], FULL_SCHEDULE.StartDate);
    assert.deepEqual(input?.['EndDate'], FULL_SCHEDULE.EndDate);
    assert.equal(input?.['Description'], FULL_SCHEDULE.Description);
    assert.equal(input?.['KmsKeyArn'], FULL_SCHEDULE.KmsKeyArn);
    assert.equal(input?.['ActionAfterCompletion'], FULL_SCHEDULE.ActionAfterCompletion);
    assert.deepEqual(input?.['FlexibleTimeWindow'], FULL_SCHEDULE.FlexibleTimeWindow);
    assert.deepEqual(input?.['Target'], FULL_SCHEDULE.Target);

    // Read-only fields must never be part of the update request.
    for (const readOnlyField of ['Arn', 'CreationDate', 'LastModificationDate', '$metadata']) {
      assert.equal(input !== undefined && readOnlyField in input, false);
    }

    assert.deepEqual(result, {
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

    const input = sent[1]?.input as unknown as Record<string, unknown> | undefined;
    assert.equal(input?.['Name'], 'orphan-job');
    assert.equal(input?.['GroupName'], 'batch-group');
  });

  it('is a no-op when the schedule is already in the requested state', async () => {
    const { client, sent } = createMockClient([FULL_SCHEDULE]);
    const service = new AWSSchedulerService(client);

    const result = await service.setScheduleState('nightly-job', 'ENABLED');

    assert.equal(sent.length, 1);
    assert.ok(sent[0] instanceof GetScheduleCommand);
    assert.deepEqual(result, {
      previousState: 'ENABLED',
      currentState: 'ENABLED',
      scheduleArn: FULL_SCHEDULE.Arn,
      unchanged: true,
    });
  });
});
