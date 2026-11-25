import type { LambdaErrorCategory } from '../types/LambdaErrorCategory.js';

/** Outcome fields surfaced by the parse step. */
export interface LambdaResultInfo {
  readonly errorCount: number;
  readonly category: LambdaErrorCategory;
  readonly requestId?: string;
  readonly runtimeStatus?: string;
  readonly durationMs?: number;
  readonly memorySizeMb?: number;
  readonly maxMemoryUsedMb?: number;
  readonly downstreamTarget?: string;
}
