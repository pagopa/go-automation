/**
 * GO CSV Adapter Factory
 *
 * Generic factory for creating and managing CSV format adapters.
 * Provides auto-detection and manual selection of adapters.
 *
 * This is a generic factory that can be used for any CSV import scenario.
 */

import type { GOCSVListImporterOptions } from './GOCSVListImporterOptions.js';
import type { GOCSVFormatAdapter } from './GOCSVFormatAdapter.js';

/**
 * Generic adapter factory for managing CSV format adapters
 * Can be extended or used directly for any CSV import scenario
 */
export class GOCSVAdapterFactory {
  private static readonly adapters: Map<string, GOCSVFormatAdapter> = new Map();

  /**
   * Register an adapter
   * @param adapter - The adapter instance to register
   */
  static registerAdapter(adapter: GOCSVFormatAdapter): void {
    this.adapters.set(adapter.getName(), adapter);
  }

  /**
   * Get an adapter by name
   * @param name - The adapter name
   * @returns The adapter instance or undefined if not found
   */
  static getAdapter(name: string): GOCSVFormatAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get all registered adapters
   * @returns Array of all registered adapters
   */
  static getAllAdapters(): GOCSVFormatAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Auto-detect and return the appropriate adapter for the CSV content
   * @param csvContent - The CSV content to analyze
   * @returns The best matching adapter or undefined if no adapter can handle it
   */
  static detectAdapter(csvContent: string): GOCSVFormatAdapter | undefined {
    // Try each adapter's canHandle method
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(csvContent)) {
        return adapter;
      }
    }

    return undefined;
  }

  /**
   * Get importer options for a specific adapter by name
   * @param name - The adapter name
   * @returns GOCSVListImporterOptions configured for the specified format
   * @throws Error if adapter not found
   */
  static getOptionsByName(name: string): GOCSVListImporterOptions<unknown> {
    const adapter = this.getAdapter(name);

    if (!adapter) {
      const availableAdapters = Array.from(this.adapters.keys()).join(', ');
      throw new Error(
        `Adapter '${name}' not found. Available adapters: ${availableAdapters || 'none'}`,
      );
    }

    return adapter.getOptions();
  }

  /**
   * Get importer options using auto-detection
   * @param csvContent - The CSV content to analyze
   * @returns GOCSVListImporterOptions for the detected format
   * @throws Error if format cannot be detected
   */
  static getOptionsByAutoDetect(csvContent: string): GOCSVListImporterOptions<unknown> {
    const adapter = this.detectAdapter(csvContent);

    if (!adapter) {
      throw new Error('Could not auto-detect CSV format. Please specify adapter name manually.');
    }

    return adapter.getOptions();
  }

  /**
   * Get information about all available adapters
   * @returns Array of adapter information
   */
  static getAdapterInfo(): { name: string; description: string }[] {
    return Array.from(this.adapters.values()).map((adapter) => ({
      name: adapter.getName(),
      description: adapter.getDescription(),
    }));
  }

  /**
   * Check if an adapter is registered
   * @param name - The adapter name
   * @returns true if the adapter is registered
   */
  static hasAdapter(name: string): boolean {
    return this.adapters.has(name);
  }

  /**
   * Unregister an adapter
   * @param name - The adapter name
   * @returns true if the adapter was removed, false if not found
   */
  static unregisterAdapter(name: string): boolean {
    return this.adapters.delete(name);
  }

  /**
   * Clear all registered adapters
   */
  static clearAdapters(): void {
    this.adapters.clear();
  }

  /**
   * Get the number of registered adapters
   * @returns Number of registered adapters
   */
  static getAdapterCount(): number {
    return this.adapters.size;
  }
}
