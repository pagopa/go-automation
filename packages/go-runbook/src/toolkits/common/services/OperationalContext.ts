import type { RunbookContext } from '../../../engine/types/RunbookContext.js';
import type { ServiceRegistry } from './ServiceRegistry.js';

/** Context of an operational step: the engine context with the operational service registry. */
export type OperationalContext = RunbookContext<ServiceRegistry>;
