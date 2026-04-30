/**
 * SEND CSV Format Adapters
 *
 * Adapters provide pre-configured GOCSVListImporterOptions for different CSV formats.
 * Each adapter encapsulates all the configuration needed to import a specific CSV format.
 */

// Re-export generic CSV adapter interfaces
export type { GOCSVFormatAdapter } from '@go-automation/go-common/core';
export { GOCSVAdapterFactory } from '@go-automation/go-common/core';

// Concrete SEND adapters
export { StandardFormatAdapter } from './StandardFormatAdapter.js';
export { QATestFormatAdapter } from './QATestFormatAdapter.js';
