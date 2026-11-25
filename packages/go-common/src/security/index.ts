/**
 * Security Module Export
 *
 * Guards against prototype-pollution keys in parsed configuration and data.
 */

export { isDangerousKey, formatUnsafeKeyLocation } from './DangerousKeys.js';
