import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseOptions } from '../options.js';

const BASE_ARGS = ['--environment', 'dev', '--regions', 'eu-south-1', '--config-dir', './deploy/dev'];

describe('environment deploy options', () => {
  it('rejects unknown options instead of silently ignoring them', () => {
    assert.throws(() => parseOptions([...BASE_ARGS, '--drain-timeut', '1h']), /Unknown option: --drain-timeut/u);
  });

  it('rejects duplicated options', () => {
    assert.throws(() => parseOptions([...BASE_ARGS, '--environment', 'dev']), /Duplicate option: --environment/u);
  });

  it('requires the control region and rejects duplicated regions', () => {
    assert.throws(
      () => parseOptions(['--environment', 'dev', '--regions', 'eu-west-1', '--config-dir', './deploy/dev']),
      /--regions must include eu-south-1/u,
    );
    assert.throws(
      () =>
        parseOptions(['--environment', 'dev', '--regions', 'eu-south-1,eu-south-1', '--config-dir', './deploy/dev']),
      /--regions contains duplicates/u,
    );
  });

  it('requires a change note only in production', () => {
    assert.throws(
      () => parseOptions(['--environment', 'production', '--regions', 'eu-south-1', '--config-dir', './deploy/prod']),
      /--change-note is required in production/u,
    );
    assert.equal(parseOptions(BASE_ARGS).changeNote, 'No change note provided');
  });

  it('parses flags, regions and drain timeout', () => {
    const options = parseOptions([
      '--environment',
      'production',
      '--regions',
      'eu-west-1,eu-south-1',
      '--config-dir',
      './deploy/prod',
      '--change-note',
      'add SEND APIGW runbook',
      '--drain-timeout',
      '30m',
      '--dry-run',
    ]);
    assert.deepEqual(options.regions, ['eu-west-1', 'eu-south-1']);
    assert.equal(options.changeNote, 'add SEND APIGW runbook');
    assert.equal(options.drainTimeoutMs, 1_800_000);
    assert.equal(options.dryRun, true);
    assert.equal(options.allowEmptyCatalog, false);
  });
});
