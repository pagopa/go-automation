import { ResolveInteropApiGwAlarmContextStep } from '../../../interop/apigw/steps/ResolveInteropApiGwAlarmContextStep.js';

import { resolveInteropSelfcareApiGwAlarmContext } from './resolveInteropAlarmContext.js';

/** Backward-compatible Selfcare adapter over the shared INTEROP APIGW context step. */
export class ResolveInteropSelfcareApiGwContextStep extends ResolveInteropApiGwAlarmContextStep {
  constructor(config: { readonly id: string; readonly label: string }) {
    super({
      ...config,
      resolverId: 'interop-selfcare-api-gateway-context',
      resolveAlarmContext: resolveInteropSelfcareApiGwAlarmContext,
    });
  }
}
