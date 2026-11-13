import type { InteropEnvironment } from '../../../environment/InteropEnvironment.js';

/** CloudWatch alarm name of an INTEROP API Gateway runbook in one environment. */
export type InteropApiGwAlarmNameFn = (environment: InteropEnvironment) => string;
