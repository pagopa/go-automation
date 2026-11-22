import type { StepTrace } from './StepTrace.js';

export type StepTraceEntry = Omit<StepTrace, 'executionOrder'>;
