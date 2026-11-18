import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseOptions } from '../options.js';

const BASE_ARGS = ['--environment', 'dev', '--regions', 'eu-south-1', '--config-dir', './deploy/dev'];

describe('environment deploy options', () => {
  it('defaults to no Watchtower override and a placeholder change note outside production', () => {
    const options = parseOptions(BASE_ARGS);
    assert.equal(options.watchtowerUrl, undefined);
    assert.equal(options.changeNote, 'No change note provided');
  });

  it('parses flags, regions, drain timeout and an explicit Watchtower destination', () => {
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
      '--watchtower-url',
      'https://watchtower.example.test/bff',
    ]);
    assert.deepEqual(options.regions, ['eu-west-1', 'eu-south-1']);
    assert.equal(options.changeNote, 'add SEND APIGW runbook');
    assert.equal(options.drainTimeoutMs, 1_800_000);
    assert.equal(options.dryRun, true);
    assert.equal(options.allowEmptyCatalog, false);
    assert.equal(options.watchtowerUrl, 'https://watchtower.example.test/bff');
  });

  const rejected: ReadonlyArray<readonly [ReadonlyArray<string>, RegExp]> = [
    [[...BASE_ARGS, '--watchtower-url', '   '], /--watchtower-url is required/u],
    [[...BASE_ARGS, '--drain-timeut', '1h'], /Unknown option: --drain-timeut/u],
    [[...BASE_ARGS, '--environment', 'dev'], /Duplicate option: --environment/u],
    [['--environment', 'dev', '--regions', 'eu-west-1', '--config-dir', './d'], /--regions must include eu-south-1/u],
    [
      ['--environment', 'dev', '--regions', 'eu-south-1,eu-south-1', '--config-dir', './d'],
      /--regions contains duplicates/u,
    ],
    [
      ['--environment', 'production', '--regions', 'eu-south-1', '--config-dir', './d'],
      /--change-note is required in production/u,
    ],
  ];

  for (const [args, error] of rejected) {
    it(`rejects ${args.slice(-2).join(' ')} with ${error.source}`, () => {
      assert.throws(() => parseOptions(args), error);
    });
  }
});
