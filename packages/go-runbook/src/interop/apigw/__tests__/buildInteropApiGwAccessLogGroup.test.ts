import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildInteropApiGwAccessLogGroup,
  INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE,
} from '../helpers/buildInteropApiGwAccessLogGroup.js';

describe('buildInteropApiGwAccessLogGroup', () => {
  it('resolves the shared environment placeholder', () => {
    assert.strictEqual(INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE.includes('<environment>'), true);
    assert.strictEqual(buildInteropApiGwAccessLogGroup('att'), 'amazon-apigateway-interop-access-logs-att');
  });

  it('rejects a blank environment', () => {
    assert.throws(() => buildInteropApiGwAccessLogGroup('   '), /must not be blank/u);
  });
});
