import type { EscapeTransformer } from './EscapeTransformer.js';

export interface InterpolatePlaceholdersOptions {
  readonly escape?: EscapeTransformer;
  readonly missingValue?: string;
}
