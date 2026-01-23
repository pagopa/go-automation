/**
 * GO CSV Format Adapter
 *
 * Base interface for CSV format adapters.
 * Adapters provide pre-configured GOCSVListImporterOptions for different CSV formats.
 *
 * This is a generic interface that can be used for any CSV import scenario,
 * not just SEND notifications.
 */

import type { GOCSVListImporterOptions } from './GOCSVListImporterOptions.js';

/**
 * Interface for CSV format adapters
 * Each adapter provides a complete GOCSVListImporterOptions configuration
 * for a specific CSV format
 */
export interface GOCSVFormatAdapter {
  /**
   * Get adapter name/identifier
   * @returns Unique identifier for this adapter
   * @example 'standard', 'qa-test', 'custom-format'
   */
  getName(): string;

  /**
   * Get adapter description
   * @returns Human-readable description of what this adapter handles
   * @example 'Standard CSV format (comma-separated, standard columns)'
   */
  getDescription(): string;

  /**
   * Get the complete GOCSVListImporterOptions configuration
   * This is the main method that returns the adapter configuration
   * @returns Complete importer options for this CSV format
   */
  getOptions(): GOCSVListImporterOptions;

  /**
   * Check if this adapter can handle the given CSV content
   * Used for auto-detection of CSV format
   * @param csvContent - Raw CSV content to analyze
   * @returns true if this adapter can handle the content, false otherwise
   */
  canHandle(csvContent: string): boolean;
}
