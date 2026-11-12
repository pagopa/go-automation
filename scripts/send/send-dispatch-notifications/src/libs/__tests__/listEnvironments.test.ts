import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import type { Core } from '@go-automation/go-common';
import { Dispatch } from '@go-automation/go-send';

import { DispatchUsageError } from '../DispatchUsageError.js';
import { listEnvironments } from '../listEnvironments.js';
import { createTestScript, writeFixture } from './helpers/testScript.js';

const ENVIRONMENTS = `environments:
  ente-test:
    basePath: api.test.example
    apiKey: \${PN_API_KEY_TEST}
    groupId: 'group-1'
    production: false
  consolidatore-test:
    mode: direct
    description: Consolidatore TEST
    ecBaseUrl: http://localhost:8888
    sender: { taxId: '00000000001', denomination: Comune di Test }
    defaults:
      direct.aar.key: PN_AAR-1.pdf
`;

/** Logger double that keeps the table rows. */
class TableLogger {
  public rows: ReadonlyArray<Readonly<Record<string, unknown>>> = [];

  public section(): void {}

  public simpleTable(rows: ReadonlyArray<Readonly<Record<string, unknown>>>): void {
    this.rows = rows;
  }

  public get logger(): Core.GOLogger {
    return this as unknown as Core.GOLogger;
  }
}

describe('listEnvironments', () => {
  it('lists e2e and direct environments in one table, without looking up a key for direct', async () => {
    const { dir } = await createTestScript();
    const file = path.join(dir, 'environments.yaml');
    await writeFixture(file, ENVIRONMENTS);
    const looked: string[] = [];
    const loader = new Dispatch.EnvironmentLoader((name) => {
      looked.push(name);
      return undefined;
    });
    const logger = new TableLogger();

    await listEnvironments(logger.logger, loader, file);

    assert.deepEqual(
      logger.rows.map((row) => [row['nome'], row['modalità'], row['url'], row['apiKey']]),
      [
        ['ente-test', 'e2e', 'https://api.test.example', '$PN_API_KEY_TEST (non impostata)'],
        ['consolidatore-test', 'direct', 'http://localhost:8888', '—'],
      ],
    );
    assert.deepEqual(
      logger.rows.map((row) => Object.keys(row)),
      [Object.keys(logger.rows[0] ?? {}), Object.keys(logger.rows[0] ?? {})],
      'same columns on every row: simpleTable reads them from the first',
    );
    assert.deepEqual(looked, ['PN_API_KEY_TEST'], 'only the e2e key variable is looked up');
  });

  it('reports a malformed environments file as a usage error, not a stack trace', async () => {
    const { dir, logger } = await createTestScript();
    const file = path.join(dir, 'environments.yaml');
    await writeFixture(file, 'environments:\n  ente-test: [unclosed\n');
    const loader = new Dispatch.EnvironmentLoader(() => undefined);

    await assert.rejects(listEnvironments(logger as unknown as Core.GOLogger, loader, file), DispatchUsageError);
  });
});
