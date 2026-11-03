import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The source page and verified alarm document Prod only. */
export const SIGNED_OBJECTS_PERSISTER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-signed-objects-persister-errors-prod',
  podApp: 'interop-be-signed-objects-persister',
  varPrefix: 'interopSignedObjectsPersister',
  environments: ['prod'],
  alarmName: (runbookKey) => runbookKey,
});
