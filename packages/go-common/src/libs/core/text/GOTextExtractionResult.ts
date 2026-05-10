/**
 * Result of a text extraction.
 */
export interface GOTextExtractionResult {
  /** Extracted plain text. */
  readonly text: string;
  /** Original page count if known (PDFs); undefined otherwise. */
  readonly pages: number | undefined;
  /** True if the extracted text was clipped to fit `maxBytes`. */
  readonly truncated: boolean;
}
