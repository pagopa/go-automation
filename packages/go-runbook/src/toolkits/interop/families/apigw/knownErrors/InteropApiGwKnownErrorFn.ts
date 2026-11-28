import type { KnownError } from '../../../../../engine/index.js';
import type { InteropApiGwKnownErrorConfig } from './InteropApiGwKnownErrorConfig.js';

export type InteropApiGwKnownErrorFn = (config: InteropApiGwKnownErrorConfig) => KnownError;
