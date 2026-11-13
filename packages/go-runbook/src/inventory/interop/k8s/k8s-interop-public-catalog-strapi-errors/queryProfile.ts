import { interop } from '../../../../toolkits/interop/index.js';

/** Raw Strapi startup warnings/stack traces have no standard INTEROP prefix. */
export const STRAPI_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = interop.k8s.interopK8sExactPodQueryProfile(
  'interop-public-catalog-strapi',
  {
    applicationLogsQueryProfileId: 'interop-public-catalog-strapi-errors',
    form: 'fields',
  },
);
