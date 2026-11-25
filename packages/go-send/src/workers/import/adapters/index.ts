/**
 * SEND CSV Format Adapters
 *
 * Adapters provide pre-configured GOCSVListImporterOptions for different CSV formats.
 * Each adapter encapsulates all the configuration needed to import a specific CSV format.
 */

// Re-export generic CSV adapter interfaces
export type { GOCSVFormatAdapter } from '@pagopa/go-common/importers';
export { GOCSVAdapterFactory } from '@pagopa/go-common/importers';

// Concrete SEND adapters
export { StandardFormatAdapter } from './StandardFormatAdapter.js';
export { QATestFormatAdapter } from './QATestFormatAdapter.js';
