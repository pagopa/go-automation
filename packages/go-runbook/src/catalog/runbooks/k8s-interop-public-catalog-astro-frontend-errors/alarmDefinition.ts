import { defineInteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-public-catalog-astro-frontend` INTEROP k8s alarm. */
export const PUBLIC_CATALOG_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-public-catalog-astro-frontend-errors',
  podApp: 'interop-public-catalog-astro-frontend',
  varPrefix: 'interopPublicCatalog',
  // The concrete alarm names carry the environment in the MIDDLE
  // (…-errors-<env>-public-catalog), so the namespace segment stays explicit
  // instead of being appended after it.
  alarmName: (runbookKey, environment) => `${runbookKey}-${environment}-public-catalog`,
});
