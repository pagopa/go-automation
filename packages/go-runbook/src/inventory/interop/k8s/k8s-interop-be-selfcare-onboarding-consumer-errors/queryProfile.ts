import { interop } from '../../../../toolkits/interop/index.js';

export const SELFCARE_ONBOARDING_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-selfcare-onboarding', {
    applicationLogsQueryProfileId: 'interop-selfcare-onboarding-errors',
  });
