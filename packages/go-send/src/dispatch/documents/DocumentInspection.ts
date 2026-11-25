import type { InspectedDocument } from './InspectedDocument.js';
import type { DocumentInspectionFailure } from './DocumentInspectionFailure.js';

/**
 * Outcome of the inspection of a local document.
 */
export type DocumentInspection = InspectedDocument | DocumentInspectionFailure;
