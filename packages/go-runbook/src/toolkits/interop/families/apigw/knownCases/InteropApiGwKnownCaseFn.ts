import type { KnownCase } from '../../../../../engine/index.js';
import type { InteropApiGwKnownCaseConfig } from './InteropApiGwKnownCaseConfig.js';

export type InteropApiGwKnownCaseFn = (config: InteropApiGwKnownCaseConfig) => KnownCase;
