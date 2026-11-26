/**
 * Test dell'esecuzione di un piano.
 *
 * Due comportamenti sono il motivo per cui questo file esiste, e sono due
 * difetti del riferimento:
 *
 * - `UnprocessedItems` non va ignorato: un batch scritto a meta' non e' un
 *   successo, e le chiavi non scritte vanno riportate;
 * - un item che fallisce in merge non deve portarsi dietro gli altri.
 */

import type { AWSDynamoDBService } from '@pagopa/go-aws/dynamodb';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyPlan } from '../libs/applySync.js';
import type { TableSyncPlan } from '../libs/planSync.js';

import { fakeScript, s } from './fixtures.js';

/** Un piano, con i campi che il test non usa gia' riempiti. */
function plan(overrides: Partial<TableSyncPlan> = {}): TableSyncPlan {
  return {
    table: 'pn-EcAnagrafica',
    account: 'confinfo',
    profile: 'send-confinfo-test',
    keys: ['cxId'],
    syncMode: 'replace',
    writes: [{ key: 'a', item: { cxId: s('a') }, reason: 'overwrite', live: undefined, droppedAttributes: [] }],
    untouched: 0,
    ...overrides,
  };
}

/** Un servizio DynamoDB finto che registra come e' stato chiamato. */
function stubService(behaviour: {
  readonly unprocessed?: ReadonlyArray<Record<string, unknown>>;
  readonly throwOn?: string;
}): {
  readonly service: AWSDynamoDBService;
  readonly batches: Record<string, unknown>[][];
  readonly updates: { key: Record<string, unknown>; attributes: Record<string, unknown> }[];
} {
  const batches: Record<string, unknown>[][] = [];
  const updates: { key: Record<string, unknown>; attributes: Record<string, unknown> }[] = [];

  const service = {
    batchWriteItemRaw: async (
      _table: string,
      items: ReadonlyArray<Record<string, unknown>>,
    ): Promise<{ written: number; unprocessed: ReadonlyArray<Record<string, unknown>> }> => {
      batches.push([...items]);
      if (behaviour.throwOn === 'batch') throw new Error('AccessDeniedException');
      const unprocessed = behaviour.unprocessed ?? [];
      return await Promise.resolve({ written: items.length - unprocessed.length, unprocessed });
    },
    updateItemRaw: async (
      _table: string,
      key: Record<string, unknown>,
      attributes: Record<string, unknown>,
    ): Promise<void> => {
      updates.push({ key, attributes });
      if (behaviour.throwOn === (key['cxId'] as Record<string, string> | undefined)?.['S']) {
        throw new Error('ConditionalCheckFailed');
      }
      await Promise.resolve();
    },
  } as unknown as AWSDynamoDBService;

  return { service, batches, updates };
}

describe('applyPlan in replace mode', () => {
  it('sends the repository items in one batched write', async () => {
    const { service, batches } = stubService({});
    const { script } = fakeScript();

    const result = await applyPlan(script, service, plan());

    assert.deepEqual(batches, [[{ cxId: s('a') }]]);
    assert.equal(result.written, 1);
    assert.deepEqual([...result.failed], []);
  });

  it('reports the keys DynamoDB never accepted instead of a full success', async () => {
    // The reference reads the response and prints 'inserted successfully'
    // regardless, so a throttled batch is recorded as written.
    const { service } = stubService({ unprocessed: [{ cxId: s('b') }] });
    const { script } = fakeScript();

    const result = await applyPlan(
      script,
      service,
      plan({
        writes: [
          { key: 'a', item: { cxId: s('a') }, reason: 'overwrite', live: undefined, droppedAttributes: [] },
          { key: 'b', item: { cxId: s('b') }, reason: 'create', live: undefined, droppedAttributes: [] },
        ],
      }),
    );

    assert.equal(result.written, 1);
    assert.deepEqual([...result.failed], ['b']);
  });

  it('turns a refused write into a failed table rather than throwing', async () => {
    const { service } = stubService({ throwOn: 'batch' });
    const { script } = fakeScript();

    const result = await applyPlan(script, service, plan());

    assert.match(result.error ?? '', /AccessDenied/);
    assert.equal(result.written, 0);
    assert.deepEqual([...result.failed], ['a']);
  });
});

describe('applyPlan in merge mode', () => {
  it('updates each item with its key split out of its attributes', async () => {
    const { service, updates } = stubService({});
    const { script } = fakeScript();

    await applyPlan(
      script,
      service,
      plan({
        syncMode: 'merge',
        writes: [
          {
            key: 'a',
            item: { cxId: s('a'), url: s('x') },
            reason: 'overwrite',
            live: undefined,
            droppedAttributes: [],
          },
        ],
      }),
    );

    assert.deepEqual(updates, [{ key: { cxId: s('a') }, attributes: { url: s('x') } }]);
  });

  it('keeps going after an item is refused, and names the one that was', async () => {
    const { service, updates } = stubService({ throwOn: 'b' });
    const { script } = fakeScript();

    const result = await applyPlan(
      script,
      service,
      plan({
        syncMode: 'merge',
        writes: [
          {
            key: 'a',
            item: { cxId: s('a'), url: s('x') },
            reason: 'overwrite',
            live: undefined,
            droppedAttributes: [],
          },
          {
            key: 'b',
            item: { cxId: s('b'), url: s('y') },
            reason: 'overwrite',
            live: undefined,
            droppedAttributes: [],
          },
          {
            key: 'c',
            item: { cxId: s('c'), url: s('z') },
            reason: 'overwrite',
            live: undefined,
            droppedAttributes: [],
          },
        ],
      }),
    );

    assert.equal(updates.length, 3);
    assert.equal(result.written, 2);
    assert.deepEqual([...result.failed], ['b']);
  });

  it('never reaches the batched write, which would replace the whole item', async () => {
    const { service, batches } = stubService({});
    const { script } = fakeScript();

    await applyPlan(script, service, plan({ syncMode: 'merge' }));

    assert.deepEqual(batches, []);
  });
});

describe('applyPlan with nothing to do', () => {
  it('calls nothing at all for an empty plan', async () => {
    const { service, batches, updates } = stubService({});
    const { script } = fakeScript();

    const result = await applyPlan(script, service, plan({ writes: [] }));

    assert.deepEqual(batches, []);
    assert.deepEqual(updates, []);
    assert.equal(result.written, 0);
  });
});
