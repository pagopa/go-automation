import { interop } from '../../../../toolkits/interop/index.js';

/** Match the actual ERROR/log or stderr metric filter and the exact updater pod. */
export const ESERVICE_TEMPLATE_INSTANCES_UPDATER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-k8s-eservice-template-instances-updater', {
    applicationLogsQueryProfileId: 'interop-k8s-eservice-template-instances-updater-application-log',
  });
