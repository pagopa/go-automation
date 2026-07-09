export function buildInteropK8sApplicationLogGroup(environment: string): string {
  const normalizedEnvironment = environment.trim();
  if (normalizedEnvironment === '') {
    throw new Error('buildInteropK8sApplicationLogGroup: environment must be a non-empty string.');
  }
  return `/aws/eks/interop-eks-cluster-${normalizedEnvironment}/application`;
}
