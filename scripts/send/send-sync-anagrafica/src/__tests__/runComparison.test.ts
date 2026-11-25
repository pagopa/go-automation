/**
 * Test dell'esito per singola tabella.
 *
 * Il caso che conta e' `failed`: una lettura **rifiutata** non deve passare
 * per una tabella vuota. Se le due cose si confondessero, una scan negata dai
 * permessi verrebbe riportata come "ogni item del file manca in tabella",
 * cioe' la drift massima possibile, su una tabella che non e' stata letta.
 */

import type { AWSDynamoDBService } from '@pagopa/go-aws/dynamodb';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { compareOne, layoutOf } from '../libs/runComparison.js';

import { makeConfig, makeTable, s } from './fixtures.js';

/** A DynamoDB service answering a scan with fixed items, or refusing it. */
function stubService(items: ReadonlyArray<Record<string, unknown>>, failWith?: string): AWSDynamoDBService {
  return {
    scanRaw: async (): Promise<ReadonlyArray<Record<string, unknown>>> => {
      if (failWith !== undefined) throw new Error(failWith);
      return await Promise.resolve(items);
    },
  } as unknown as AWSDynamoDBService;
}

/** A repository holding one table file with the given lines. */
async function repositoryWith(table: string, lines: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'send-sync-run-'));
  const directory = path.join(root, 'test', '_conf', 'confinfo', 'dynamodb');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
  await fs.mkdir(directory, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
  await fs.writeFile(path.join(directory, `${table}.json`), lines, 'utf8');
  return root;
}

describe('compareOne, a table not defined in this environment', () => {
  /** A service that fails the test if anything is read from it. */
  const unreadable = {
    scanRaw: async (): Promise<never> => await Promise.reject(new Error('the table must not be read')),
  } as unknown as AWSDynamoDBService;

  it('is reported as not defined, without reading the table or looking for a missing file', async () => {
    const outcome = await compareOne(
      unreadable,
      layoutOf(makeConfig({ configPath: '/nowhere' })),
      makeTable({ environments: ['uat', 'prod'] }),
      'send-confinfo-test',
    );

    assert.equal(outcome.status, 'not-defined');
    assert.match(outcome.detail, /not defined in test \(defined in uat, prod\)/);
  });

  it('says no environment defines it when the list is empty', async () => {
    const outcome = await compareOne(
      unreadable,
      layoutOf(makeConfig({ configPath: '/nowhere' })),
      makeTable({ environments: [] }),
      'send-confinfo-test',
    );

    assert.equal(outcome.status, 'not-defined');
    assert.match(outcome.detail, /no environment yet/);
  });

  it('names a file it does not compare, since the repository may carry one for a table that is not provisioned', async () => {
    const root = await repositoryWith('pn-EcAnagrafica', '{"cxId":{"S":"pn-delivery"}}\n');

    const outcome = await compareOne(
      unreadable,
      layoutOf(makeConfig({ configPath: root })),
      makeTable({ environments: ['uat'] }),
      'send-confinfo-test',
    );

    assert.equal(outcome.status, 'not-defined');
    assert.match(outcome.detail, /pn-EcAnagrafica\.json is not compared/);
  });

  it('is compared as usual in an environment that defines it', async () => {
    const outcome = await compareOne(
      stubService([]),
      layoutOf(makeConfig({ configPath: '/nowhere' })),
      makeTable({ environments: ['test'] }),
      'send-confinfo-test',
    );

    assert.equal(outcome.status, 'missing-file');
  });
});

describe('compareOne', () => {
  it('reports a configured table whose file is not in the repository', async () => {
    const outcome = await compareOne(
      stubService([]),
      layoutOf(makeConfig({ configPath: '/nowhere' })),
      makeTable(),
      'send-confinfo-test',
    );

    assert.equal(outcome.status, 'missing-file');
  });

  it('keeps a refused read apart from an empty table', async () => {
    const root = await repositoryWith('pn-EcAnagrafica', '{"cxId":{"S":"pn-delivery"}}\n');

    const outcome = await compareOne(
      stubService([], 'AccessDeniedException: not authorized'),
      layoutOf(makeConfig({ configPath: root })),
      makeTable(),
      'send-confinfo-test',
    );

    assert.equal(outcome.status, 'failed', 'a denied scan must not read as maximal drift');
    assert.match(outcome.detail, /AccessDenied/);
    assert.deepEqual([...outcome.onlyRepository], [], 'and it must not report the file as missing from the table');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('calls a table aligned when both sides agree', async () => {
    const root = await repositoryWith('pn-EcAnagrafica', '{"cxId":{"S":"pn-delivery"}}\n');

    const outcome = await compareOne(
      stubService([{ cxId: s('pn-delivery') }]),
      layoutOf(makeConfig({ configPath: root })),
      makeTable(),
      'send-confinfo-test',
    );

    assert.equal(outcome.status, 'aligned');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('reports drift and counts the protected items apart from it', async () => {
    const root = await repositoryWith('pn-EcAnagrafica', '{"cxId":{"S":"pn-delivery"}}\n');

    const outcome = await compareOne(
      stubService([{ cxId: s('pn-cons-000') }, { cxId: s('stray') }]),
      layoutOf(makeConfig({ configPath: root })),
      makeTable({ protectedKey: { name: 'cxId', values: ['pn-cons-000'] } }),
      'send-confinfo-test',
    );

    assert.equal(outcome.status, 'drifted');
    assert.equal(outcome.protectedItems.length, 1);
    assert.match(outcome.detail, /1 protected/);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('turns an unparseable file into a failure rather than a crash', async () => {
    const root = await repositoryWith('pn-EcAnagrafica', 'not json\n');

    const outcome = await compareOne(
      stubService([]),
      layoutOf(makeConfig({ configPath: root })),
      makeTable(),
      'send-confinfo-test',
    );

    assert.equal(outcome.status, 'failed');
    assert.match(outcome.detail, /is not valid JSON/);
    await fs.rm(root, { recursive: true, force: true });
  });
});
