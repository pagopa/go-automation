import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunbookContext } from '../../../../engine/types/RunbookContext.js';
import { NOOP_RUNBOOK_REPORTER } from '../../../../engine/reporting/NOOP_RUNBOOK_REPORTER.js';
import type { AwsAccountSourceSelection } from '../AwsAccountSourceSelection.js';
import { resolveAwsAccountTargets } from '../resolveAwsAccountTargets.js';

const SELECTION: AwsAccountSourceSelection = {
  subject: 'example',
  accounts: [
    { name: 'a', accountId: '111111111111', profiles: ['a-readonly', 'a-admin'] },
    { name: 'b', accountId: '222222222222', profiles: ['b'] },
  ],
  scope: 'every-account',
  defaultRegion: 'eu-south-1',
};

function context(params: ReadonlyArray<readonly [string, string]>): RunbookContext {
  return {
    executionId: 'accounts-test',
    startedAt: new Date('2026-10-06T18:05:00.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map(params),
    logs: [],
    services: { reporter: NOOP_RUNBOOK_REPORTER },
    recoveredErrors: [],
  };
}

describe('resolveAwsAccountTargets', () => {
  it('requires a profile for every account locally, preferring the first configured one', () => {
    const targets = resolveAwsAccountTargets(context([['awsProfiles', 'b,a-admin:b,a-readonly']]), SELECTION);
    assert.deepEqual(
      targets.map(({ account, region, profile }) => [account.name, region, profile]),
      [
        ['a', 'eu-south-1', 'a-readonly'],
        ['b', 'eu-south-1', 'b'],
      ],
    );
    assert.throws(
      () => resolveAwsAccountTargets(context([['awsProfiles', 'a-admin']]), SELECTION),
      /example: missing b AWS profile/u,
    );
  });

  it('reads every account through OAM, or only the occurrence account, in cloud execution', () => {
    const cloud = context([
      ['awsAccountId', '222222222222'],
      ['awsProfiles', ''],
      ['awsRegion', 'eu-central-1'],
    ]);
    assert.deepEqual(
      resolveAwsAccountTargets(cloud, SELECTION).map(({ account, region, profile }) => [account.name, region, profile]),
      [
        ['a', 'eu-central-1', undefined],
        ['b', 'eu-central-1', undefined],
      ],
    );
    assert.deepEqual(
      resolveAwsAccountTargets(cloud, { ...SELECTION, scope: 'occurrence-account' }).map(({ account }) => account.name),
      ['b'],
    );
  });

  it('rejects an unknown occurrence account and, when restricted, another region', () => {
    assert.throws(
      () => resolveAwsAccountTargets(context([['awsAccountId', '333333333333']]), SELECTION),
      /example: unsupported occurrence account 333333333333/u,
    );
    assert.throws(
      () =>
        resolveAwsAccountTargets(context([['awsRegion', 'eu-west-1']]), {
          ...SELECTION,
          restrictToDefaultRegion: true,
        }),
      /example: unsupported region eu-west-1/u,
    );
  });
});
