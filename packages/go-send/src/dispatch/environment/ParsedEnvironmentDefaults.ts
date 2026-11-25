import type { FieldValues } from '../mapping/FieldValues.js';
import type { SharedDocumentConfig } from './SharedDocumentConfig.js';

/**
 * The `defaults` block of an environment, split into canonical field values
 * and the shared document (`documents.shared`), which is not a field.
 */
export interface ParsedEnvironmentDefaults {
  readonly defaults: FieldValues;
  readonly sharedDocument?: SharedDocumentConfig;
}
