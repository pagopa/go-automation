import type { StepEvidence } from '../output/StepEvidence.js';

declare module '../../../engine/types/StepDescriptorExtensions.js' {
  /** Operational fields of a step descriptor. */
  interface StepDescriptorExtensions {
    /** Evidence retained from the step output for Watchtower. */
    readonly evidence?: ReadonlyArray<StepEvidence>;
  }
}

/** Marker that loads the operational fields of `StepDescriptor`. */
export type StepDescriptorExtensionsAugmentation = 'stepDescriptor';
