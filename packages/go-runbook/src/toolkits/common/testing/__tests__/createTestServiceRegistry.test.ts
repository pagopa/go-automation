import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestServiceRegistry, recordedServiceCalls } from '../createTestServiceRegistry.js';
import { UnexpectedServiceCallError } from '../UnexpectedServiceCallError.js';
import { OPERATIONAL_SERVICE_CAPABILITIES } from '../../services/OPERATIONAL_SERVICE_CAPABILITIES.js';
import { CollectingRunbookReporter } from '../../../../engine/reporting/CollectingRunbookReporter.js';
import { NOOP_RUNBOOK_REPORTER } from '../../../../engine/reporting/NOOP_RUNBOOK_REPORTER.js';

describe('createTestServiceRegistry', () => {
  it('defaults the reporter to the NOOP one', () => {
    assert.strictEqual(createTestServiceRegistry().reporter, NOOP_RUNBOOK_REPORTER);
  });

  it('uses the reporter a test provides', () => {
    const reporter = new CollectingRunbookReporter();

    assert.strictEqual(createTestServiceRegistry({ reporter }).reporter, reporter);
  });

  it('keeps the NOOP reporter when the override is explicitly undefined', () => {
    assert.strictEqual(createTestServiceRegistry({ reporter: undefined }).reporter, NOOP_RUNBOOK_REPORTER);
  });

  it('is complete by construction: every service passes its capability check', () => {
    const services = createTestServiceRegistry() as unknown as Readonly<Record<string, unknown>>;

    for (const [name, isCapable] of Object.entries(OPERATIONAL_SERVICE_CAPABILITIES)) {
      assert.strictEqual(isCapable(services[name]), true, name);
    }
  });

  it('merges a partial stub method by method', async () => {
    const query = async (): Promise<never[]> => Promise.resolve([]);
    const services = createTestServiceRegistry({ dynamodb: { query } });

    assert.strictEqual((services.dynamodb as unknown as { readonly query: unknown }).query, query);
    assert.strictEqual(OPERATIONAL_SERVICE_CAPABILITIES['dynamodb']?.(services.dynamodb), true);
    await assert.rejects(
      async () => services.dynamodb.putItem('table', {}),
      (error: unknown) => error instanceof UnexpectedServiceCallError && error.method === 'dynamodb.putItem',
    );
  });

  it('derives the CloudWatch Logs read the stub does not implement from the one it does', async () => {
    const rows = [[{ field: '@message', value: 'boom' }]];
    const range = { start: new Date(), end: new Date() };
    const fromQuery = createTestServiceRegistry({ cloudWatchLogs: { query: async () => Promise.resolve(rows) } });
    const fromStatistics = createTestServiceRegistry({
      cloudWatchLogs: {
        queryWithStatistics: async () =>
          Promise.resolve({
            rows,
            statistics: { bytesScanned: 1, recordsScanned: 1, recordsMatched: 1 },
            queryExecutions: [],
          }),
      },
    });

    assert.deepStrictEqual((await fromQuery.cloudWatchLogs.queryWithStatistics([], '', range)).rows, rows);
    assert.deepStrictEqual(await fromStatistics.cloudWatchLogs.query([], '', range), rows);
  });

  it('returns a stub that already exposes every method as is', () => {
    const dynamodb = {
      query: () => [],
      getItem: () => undefined,
      updateItem: () => undefined,
      putItem: () => undefined,
    };

    assert.strictEqual(createTestServiceRegistry({ dynamodb }).dynamodb, dynamodb);
  });

  it('derives scoped services from the same fake and records the arguments', () => {
    const services = createTestServiceRegistry();
    const target = { accountId: '123456789012', region: 'eu-south-1' };

    const scoped = services.cloudWatchLogs.forTarget(target);

    assert.strictEqual(scoped, services.cloudWatchLogs);
    assert.deepStrictEqual(recordedServiceCalls(services.cloudWatchLogs), [{ method: 'forTarget', args: [target] }]);
  });

  it('treats an explicitly undefined service override as not provided', async () => {
    const services = createTestServiceRegistry({ dynamodb: undefined });

    await assert.rejects(
      async () => services.dynamodb.putItem('table', {}),
      (error: unknown) => error instanceof UnexpectedServiceCallError && error.method === 'dynamodb.putItem',
    );
  });
});
