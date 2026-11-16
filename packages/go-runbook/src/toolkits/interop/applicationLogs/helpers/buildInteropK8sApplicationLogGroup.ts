export const INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE = '/aws/eks/interop-eks-cluster-<environment>/application';

export function buildInteropK8sApplicationLogGroup(environment: string): string {
  const normalizedEnvironment = environment.trim();
  if (normalizedEnvironment === '') {
    throw new Error('buildInteropK8sApplicationLogGroup: environment must be a non-empty string.');
  }
  return INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE.replace('<environment>', normalizedEnvironment);
}
