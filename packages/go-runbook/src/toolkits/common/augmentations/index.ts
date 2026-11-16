import type { ExecutionEnvironmentExtensionsAugmentation } from './ExecutionEnvironmentExtensions.js';
import type { KnownCaseExtensionsAugmentation } from './KnownCaseExtensions.js';
import type { RunbookExtensionsAugmentation } from './RunbookExtensions.js';
import type { StepDescriptorExtensionsAugmentation } from './StepDescriptorExtensions.js';
import type { StepDiagnosticsAugmentation } from './StepDiagnostics.js';
import type { ValidationErrorCodesAugmentation } from './ValidationErrorCodes.js';

/**
 * Marker of the operational model (EVO-RBREORG-OPUS-01 §7.1.3 E, RBREORG-11).
 *
 * Every operational entrypoint re-exports it as a type: the re-export stays in
 * the emitted declarations and drags the augmentations into the program of an
 * installed consumer, so `knownCase.analysis`, `descriptor.evidence` and the
 * other operational fields compile there. The engine entrypoint never reaches it.
 */
export interface OperationalModelAugmentations {
  readonly runbook: RunbookExtensionsAugmentation;
  readonly knownCase: KnownCaseExtensionsAugmentation;
  readonly stepDescriptor: StepDescriptorExtensionsAugmentation;
  readonly stepDiagnostics: StepDiagnosticsAugmentation;
  readonly executionEnvironment: ExecutionEnvironmentExtensionsAugmentation;
  readonly validationErrorCodes: ValidationErrorCodesAugmentation;
}
