import type { WorkflowServices } from '../../../engine/index.js';
import type { ServiceRegistry } from './ServiceRegistry.js';

/** Operational services a step can require: the registry minus what every workflow already has. */
export type OperationalServiceName = Exclude<keyof ServiceRegistry, keyof WorkflowServices>;
