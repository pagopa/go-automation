import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildInteropK8sApplicationLogGroup } from '../buildInteropK8sApplicationLogGroup.js';

describe('buildInteropK8sApplicationLogGroup', () => {
  it('builds the environment-specific INTEROP EKS application log group and rejects a blank environment', () => {
    assert.strictEqual(buildInteropK8sApplicationLogGroup('att'), '/aws/eks/interop-eks-cluster-att/application');
    assert.throws(() => buildInteropK8sApplicationLogGroup(' '), /environment must be a non-empty string/);
  });
});
