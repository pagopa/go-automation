import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildInteropK8sApplicationLogGroup, INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE } from '../helpers/index.js';

describe('buildInteropK8sApplicationLogGroup', () => {
  it('exposes the canonical environment-aware log group template', () => {
    assert.strictEqual(
      INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
      '/aws/eks/interop-eks-cluster-<environment>/application',
    );
  });

  it('builds the environment-specific INTEROP EKS application log group', () => {
    assert.strictEqual(buildInteropK8sApplicationLogGroup('att'), '/aws/eks/interop-eks-cluster-att/application');
  });

  it('rejects blank environments', () => {
    assert.throws(() => buildInteropK8sApplicationLogGroup(' '), /environment must be a non-empty string/);
  });
});
