import type { DocumentInspection } from './DocumentInspection.js';
import type { DocumentInspectionFailure } from './DocumentInspectionFailure.js';

/**
 * Type guard: whether an inspection failed.
 *
 * @param inspection - Outcome of `LocalDocumentInspector.inspect`
 * @returns `true` for a failure
 */
export function isInspectionFailure(inspection: DocumentInspection): inspection is DocumentInspectionFailure {
  return 'failure' in inspection;
}
