import type { KnownCaseAnalysis } from '../analysis/KnownCaseAnalysis.js';

declare module '../../../engine/types/KnownCaseExtensions.js' {
  /** Operational fields of a known case. */
  interface KnownCaseExtensions {
    /** Analysis annotation turned into a Watchtower draft. */
    readonly analysis?: KnownCaseAnalysis;
  }
}

/** Marker that loads the operational fields of `KnownCase`. */
export type KnownCaseExtensionsAugmentation = 'knownCase';
