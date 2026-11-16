/** Service identity used by INTEROP k8s runbooks for step naming, vars and output context. */
export interface InteropK8sServiceDescriptor {
  readonly name: string;
  readonly logGroup: string;
  readonly varPrefix: string;
}
