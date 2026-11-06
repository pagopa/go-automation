import type { InspectedDocument } from './InspectedDocument.js';

/**
 * A row document to upload, with the title it gets in the notification.
 */
export interface DocumentToUpload {
  readonly title: string;
  readonly inspected: InspectedDocument;
}
