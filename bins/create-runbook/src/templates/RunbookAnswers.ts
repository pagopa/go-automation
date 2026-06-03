/**
 * Fully resolved answers for a runbook scaffold: the common fields shared
 * by every template plus the template-specific values in {@link extras}.
 */
export interface RunbookAnswers {
  /** Id of the chosen template (e.g. `api-gateway`). */
  readonly templateId: string;
  /** Runbook id / directory name. */
  readonly id: string;
  /** Builder function name (e.g. `buildDeliveryB2BApiGwAlarmRunbook`). */
  readonly builderName: string;
  /** Runbook metadata `name`. */
  readonly metadataName: string;
  /** Runbook metadata `description`. */
  readonly description: string;
  /** Runbook metadata `version`. */
  readonly version: string;
  /** Runbook metadata `team`. */
  readonly team: string;
  /** Runbook metadata `tags`. */
  readonly tags: ReadonlyArray<string>;
  /** Template-specific inputs, keyed by {@link TemplateInput.name}. */
  readonly extras: ReadonlyMap<string, string>;
}
