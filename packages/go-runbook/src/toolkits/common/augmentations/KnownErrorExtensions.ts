import type { KnownErrorAnalysis } from '../analysis/KnownErrorAnalysis.js';

declare module '../../../engine/types/KnownErrorExtensions.js' {
  /** Operational fields of a known error. */
  interface KnownErrorExtensions {
    /** Analysis annotation turned into a Watchtower draft. */
    readonly analysis?: KnownErrorAnalysis;
  }
}

/** Marker that loads the operational fields of `KnownError`. */
export type KnownErrorExtensionsAugmentation = 'knownError';
