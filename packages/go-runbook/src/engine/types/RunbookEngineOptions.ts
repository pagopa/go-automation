import type { LogActionRenderer } from '../actions/LogActionRenderer.js';
import type { ServiceCapabilityCheck } from './ServiceCapabilityCheck.js';

/** Collaborators injected into a {@link RunbookEngine}. */
export interface RunbookEngineOptions {
  /** Capability predicates of the services the steps declare as required. */
  readonly serviceCapabilities?: ServiceCapabilityCheck;
  /** Renderer of log actions; the engine default is plain text. */
  readonly logActionRenderer?: LogActionRenderer;
}
