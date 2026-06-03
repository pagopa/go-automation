import type { RunbookTemplate } from './RunbookTemplate.js';
import type { RunbookAnswers } from './RunbookAnswers.js';
import { commonPlaceholders } from './commonPlaceholders.js';

/**
 * Builds the placeholder tokens for the generic/base template.
 *
 * @param answers - Resolved scaffold answers
 * @returns Token map consumed by {@link renderTemplate}
 */
function basePlaceholders(answers: RunbookAnswers): ReadonlyMap<string, string> {
  return commonPlaceholders(answers);
}

/**
 * Generic/base runbook template: a single `runbook.ts` built with
 * `RunbookBuilder`, ready to extend with steps and known cases.
 */
export const BASE_TEMPLATE: RunbookTemplate = {
  id: 'base',
  label: 'Generic / Base runbook',
  description: 'Runbook generico minimale basato su RunbookBuilder, pronto da estendere.',
  templateDir: 'base',
  files: [{ template: 'runbook.ts.template', output: 'runbook.ts' }],
  inputs: [],
  buildPlaceholders: basePlaceholders,
};
