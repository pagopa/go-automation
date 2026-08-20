import { interop } from '../framework.js';

import type { InteropEnvironment } from './InteropEnvironment.js';

/**
 * Alarm context produced by the local INTEROP k8s resolvers: the toolkit
 * contract narrowed to the environments supported by this script.
 */
export interface InteropAlarmContext extends interop.k8s.InteropK8sAlarmContext {
  readonly environment: InteropEnvironment;
}
