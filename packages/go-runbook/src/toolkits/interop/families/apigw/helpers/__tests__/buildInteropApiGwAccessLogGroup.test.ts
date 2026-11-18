import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildInteropApiGwAccessLogGroup } from '../buildInteropApiGwAccessLogGroup.js';

describe('buildInteropApiGwAccessLogGroup', () => {
  it('resolves the environment placeholder and rejects a blank environment', () => {
    assert.strictEqual(buildInteropApiGwAccessLogGroup('att'), 'amazon-apigateway-interop-access-logs-att');
    assert.throws(() => buildInteropApiGwAccessLogGroup('   '), /must not be blank/u);
  });
});
