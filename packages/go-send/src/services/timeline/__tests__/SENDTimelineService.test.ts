import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

import { SENDTimelineService } from '../SENDTimelineService.js';

/** DynamoDB client double that serves pages and records the queries. */
class PagedClient {
  public readonly inputs: Record<string, unknown>[] = [];

  constructor(private readonly pages: ReadonlyArray<ReadonlyArray<Record<string, { S: string }>>>) {}

  public async send(command: QueryCommand): Promise<unknown> {
    await Promise.resolve();
    const input = command.input as unknown as Record<string, unknown>;
    this.inputs.push(input);
    const page = this.inputs.length - 1;
    return {
      Items: this.pages[page] ?? [],
      ...(page < this.pages.length - 1 && {
        LastEvaluatedKey: { iun: { S: 'x' }, timelineElementId: { S: `p${page}` } },
      }),
    };
  }
}

const item = (id: string, category: string, timestamp: string): Record<string, { S: string }> => ({
  iun: { S: 'IUN' },
  timelineElementId: { S: id },
  category: { S: category },
  timestamp: { S: timestamp },
});

describe('SENDTimelineService', () => {
  it('follows LastEvaluatedKey and projects only id, category and timestamp', async () => {
    const client = new PagedClient([
      [item('B', 'REQUEST_ACCEPTED', '2026-01-01T10:00:01Z')],
      [item('A', 'PREPARE_ANALOG_DOMICILE', '2026-01-01T10:00:01Z'), item('C', 'X', '2026-01-01T09:00:00Z')],
    ]);
    const service = new SENDTimelineService(client as unknown as DynamoDBClient);

    const elements = await service.queryTimelineElements('IUN');
    assert.deepEqual(
      elements.map((element) => element.timelineElementId),
      ['C', 'A', 'B'],
      'sorted by timestamp, ties by id',
    );
    assert.equal(client.inputs.length, 2);
    assert.equal(client.inputs[0]?.['ProjectionExpression'], 'timelineElementId, category, #ts');
    assert.deepEqual(client.inputs[1]?.['ExclusiveStartKey'], { iun: { S: 'x' }, timelineElementId: { S: 'p0' } });
  });

  it('paginates queryTimeline too', async () => {
    const client = new PagedClient([[item('B', 'B', '2026-01-02')], [item('A', 'A', '2026-01-01')]]);
    const result = await new SENDTimelineService(client as unknown as DynamoDBClient).queryTimeline({
      iun: 'IUN',
      dateFilter: null,
    });
    assert.deepEqual(
      result.timeline.map((element) => element.timelineElementId),
      ['A', 'B'],
    );
  });
});
