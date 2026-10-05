import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The template instances updater alarm; Prod and Collaudo verified in AWS. */
export const ESERVICE_TEMPLATE_INSTANCES_UPDATER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-eservice-template-instances-updater-errors',
  podApp: 'interop-be-eservice-template-instances-updater',
  varPrefix: 'interopEserviceTemplateInstancesUpdater',
});
