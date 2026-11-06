import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { DispatchTarget } from '../../types/DispatchTarget.js';
import { openTunnel } from '../openTunnel.js';
import { createTestScript } from './helpers/testScript.js';

const DIRECT: DispatchTarget = {
  name: 'consolidatore-test',
  externalChannels: { baseUrl: 'http://localhost:8888', clientId: 'pn-cons-000' },
  production: false,
  defaults: new Map(),
};

describe('openTunnel', () => {
  it('opens nothing without a tunnel in the environment, or in a dry run', async () => {
    const { script, logger } = await createTestScript();
    const withTunnel: DispatchTarget = {
      ...DIRECT,
      tunnel: {
        awsProfile: 'sso_pn-confinfo-test',
        target: 'i-065a7d9f4a91add01',
        remoteHost: 'h',
        remotePort: 8080,
        localPort: 8888,
      },
    };

    assert.equal(await openTunnel(script, DIRECT, false), undefined);
    assert.equal(await openTunnel(script, withTunnel, true), undefined, 'a dry run makes no call');
    assert.deepEqual(logger.lines, [], 'nothing logged, no AWS client used');
  });
});
