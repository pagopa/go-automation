import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-m2m-audit-signer` INTEROP k8s alarm in every environment. */
export const M2M_AUDIT_SIGNER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-m2m-audit-signer-errors',
  podApp: 'interop-be-m2m-audit-signer',
  varPrefix: 'interopM2mAuditSigner',
});
