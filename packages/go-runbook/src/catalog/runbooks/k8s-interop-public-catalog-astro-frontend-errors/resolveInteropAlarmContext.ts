import { interop } from '../framework.js';

import type { InteropAlarmContext } from '../interop/InteropAlarmContext.js';
import { INTEROP_ENVIRONMENTS, isInteropEnvironment } from '../interop/InteropEnvironment.js';

export const INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY: string = 'k8s-interop-public-catalog-astro-frontend-errors';
export const INTEROP_PUBLIC_CATALOG_SERVICE_NAME: string = 'interop-public-catalog-astro-frontend';
export const INTEROP_PUBLIC_CATALOG_VAR_PREFIX: string = 'interopPublicCatalog';
export const INTEROP_PUBLIC_CATALOG_STATIC_LOG_GROUP: string = '/aws/eks/interop-eks-cluster-<environment>/application';

// The concrete alarm names carry the environment in the MIDDLE
// (…-errors-<env>-public-catalog), so the alias list and the pattern keep the
// trailing namespace segment explicit instead of appending the environment.
const ALARM_NAME_SUFFIX = 'public-catalog';

export const INTEROP_PUBLIC_CATALOG_ALARM_NAMES: readonly [string, ...string[]] = INTEROP_ENVIRONMENTS.map(
  (environment) => `${INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY}-${environment}-${ALARM_NAME_SUFFIX}`,
) as [string, ...string[]]; // Safe: INTEROP_ENVIRONMENTS is a non-empty tuple

// The runbook key and suffix are plain slugs (alphanumerics and "-"), so they
// can be interpolated without regex escaping.
const PUBLIC_CATALOG_ALARM_PATTERN = new RegExp(
  `^${INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY}-(?<environment>${INTEROP_ENVIRONMENTS.join('|')})-${ALARM_NAME_SUFFIX}$`,
  'u',
);

export function resolveInteropPublicCatalogAlarmContext(alarmName: string): InteropAlarmContext {
  const match = PUBLIC_CATALOG_ALARM_PATTERN.exec(alarmName);
  const environment = match?.groups?.['environment'];
  if (!isInteropEnvironment(environment)) {
    // Sorted like the registry/catalog descriptors expose alarmNames.
    const expectedAlarmNames = [...INTEROP_PUBLIC_CATALOG_ALARM_NAMES].sort().join(', ');
    throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected one of: ${expectedAlarmNames}`);
  }

  return {
    alarmName,
    runbookKey: INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY,
    environment,
    podApp: INTEROP_PUBLIC_CATALOG_SERVICE_NAME,
    logGroup: interop.k8s.buildInteropK8sApplicationLogGroup(environment),
  };
}
