import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { parseAutomaticAlarmAnalysisCommandV1 } from '../parseAutomaticAlarmAnalysisCommandV1.js';

describe('parseAutomaticAlarmAnalysisCommandV1', () => {
  it('accepts the WT fixture and rejects its unsupported-version fixture', async () => {
    const fixtureRoot = resolve(
      import.meta.dirname,
      '../../../../contracts/runbook-automation/v1/upstream/go-watchtower/fixtures',
    );
    const valid: unknown = JSON.parse(await readFile(resolve(fixtureRoot, 'sqs-command.valid.json'), 'utf8'));
    const invalid: unknown = JSON.parse(
      await readFile(resolve(fixtureRoot, 'sqs-command.invalid-version.json'), 'utf8'),
    );

    assert.strictEqual(parseAutomaticAlarmAnalysisCommandV1(valid).schemaVersion, '1.0.0');
    assert.throws(() => parseAutomaticAlarmAnalysisCommandV1(invalid), /schemaVersion/);
  });
});
