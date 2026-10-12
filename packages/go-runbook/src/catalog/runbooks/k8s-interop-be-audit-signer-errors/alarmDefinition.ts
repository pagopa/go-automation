import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** Canonical alarm and pod names verified in CloudWatch for Prod and Collaudo. */
export const AUDIT_SIGNER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-audit-signer-errors',
  podApp: 'interop-be-audit-signer',
  varPrefix: 'interopAuditSigner',
});
