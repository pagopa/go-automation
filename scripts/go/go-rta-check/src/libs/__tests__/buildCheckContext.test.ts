import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOScript } from '@go-automation/go-script';
import { RuntimeAwsAccountsPort } from '@pagopa/go-runbook/runtime';

import type { GoRtaCheckConfig } from '../../types/GoRtaCheckConfig.js';
import { buildCheckContext, type BuildCheckContextOptions } from '../buildCheckContext.js';

/** What the monitoring CloudWatch Logs reader was bound to. */
interface ForTargetCall {
  readonly target: unknown;
  readonly activeOperations: unknown;
}

/** Script whose monitoring identity cannot select a profile of the occurrence account. */
function fakeScript(calls: ForTargetCall[]): GOScript {
  const reader = {
    forTarget: (target: unknown, activeOperations: unknown) => {
      calls.push({ target, activeOperations });
      return reader;
    },
  };
  // Safe: only the members read by buildCheckContext and the bound registry are provided.
  return {
    logger: { info: () => undefined },
    aws: {
      clients: {
        profileNames: ['monitoring'],
        first: { getRegion: () => 'eu-south-1' },
        getClientProvider: () => ({ getRegion: () => 'eu-south-1' }),
      },
      services: {
        profileNames: ['monitoring'],
        cloudWatchLogs: reader,
        cloudWatchMetrics: {},
        athena: { forExecution: () => ({}) },
        dynamoDB: {},
      },
      servicesFor: () => {
        throw new Error('OAM must not select a profile of the occurrence account');
      },
    },
  } as unknown as GOScript;
}

function options(script: GOScript, config: GoRtaCheckConfig): BuildCheckContextOptions {
  // Safe: connection, target and matcher are only stored in the context.
  return {
    script,
    connection: { client: {}, baseUrl: 'https://watchtower' },
    target: { productId: 'p', productName: 'P', alarm: {}, alarmName: 'pn-delivery-B2B-ApiGwAlarm' },
    config,
    awsProfiles: ['monitoring'],
    analysisMatcher: { kind: 'lexical', match: async () => Promise.resolve(undefined) },
  } as unknown as BuildCheckContextOptions;
}

describe('buildCheckContext — logical AWS accounts', () => {
  it('with the oam binding binds the occurrence through OAM, without a source-account profile', async () => {
    const calls: ForTargetCall[] = [];
    const context = buildCheckContext(
      options(fakeScript(calls), { awsAccountBinding: 'oam', awsAccountDirectory: ['send/core/prod=000000000101'] }),
    );
    // Safe: the registry is only identified, never used.
    const activeOperations = {} as never;

    const resolved = await context.servicesFor({ accountId: '000000000101', region: 'eu-south-1' }, activeOperations);

    assert.deepStrictEqual(calls, [{ target: { accountId: '000000000101', region: 'eu-south-1' }, activeOperations }]);
    assert.deepStrictEqual(resolved.awsProfiles, ['monitoring']);
    assert.ok(context.accounts?.port instanceof RuntimeAwsAccountsPort);
    assert.strictEqual(context.accounts?.binding, 'oam');
  });
});
