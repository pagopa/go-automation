import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { parseExecuteRunbookMessage, recoverValidExecutionId } from '../parseExecuteRunbookMessage.js';

describe('parseExecuteRunbookMessage', () => {
  it('consumes the WT fixtures and recovers only a valid execution id', async () => {
    const fixtureRoot = resolve(
      import.meta.dirname,
      '../../../../../../contracts/runbook-automation/v1/upstream/go-watchtower/fixtures',
    );
    const valid = await readFile(resolve(fixtureRoot, 'sqs-command.valid.json'), 'utf8');
    const invalid = await readFile(resolve(fixtureRoot, 'sqs-command.invalid-version.json'), 'utf8');

    assert.strictEqual(parseExecuteRunbookMessage(valid).schemaVersion, '1.0.0');
    assert.throws(() => parseExecuteRunbookMessage(invalid), /schemaVersion/);
    assert.strictEqual(recoverValidExecutionId(invalid), '0192c000-0000-7000-8000-000000000001');
    assert.strictEqual(recoverValidExecutionId('{'), undefined);
  });
});
