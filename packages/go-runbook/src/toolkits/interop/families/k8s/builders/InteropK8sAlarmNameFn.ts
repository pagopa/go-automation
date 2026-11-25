import type { InteropEnvironment } from '../../../environment/InteropEnvironment.js';

/** Builds the CloudWatch alarm name a runbook answers to, for one environment. */
export type InteropK8sAlarmNameFn = (runbookKey: string, environment: InteropEnvironment) => string;
