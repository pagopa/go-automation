/**
 * Describes a single file emitted by a runbook template.
 */
export interface TemplateFile {
  /** Template file name under the template dir (e.g. `runbook.ts.template`). */
  readonly template: string;
  /** Output file name written into the runbook directory (e.g. `runbook.ts`). */
  readonly output: string;
}
