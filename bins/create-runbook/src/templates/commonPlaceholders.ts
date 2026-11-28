import { knownErrorCodeOf } from '../../../../packages/go-runbook/src/toolkits/common/registration/knownErrorCodeOf.js';
import { isRunbookKind } from '../../../../packages/go-runbook/src/toolkits/common/registration/isRunbookKind.js';
import type { RunbookAnswers } from './RunbookAnswers.js';
import { formatTagsLiteral } from './formatTagsLiteral.js';

/** The name of the example known error the templates carry. */
const EXAMPLE_KNOWN_ERROR = 'example-known-error';

/**
 * Builds the placeholder tokens shared by every runbook template.
 *
 * Returns a fresh mutable map so template-specific builders can extend it
 * without sharing state across runs.
 *
 * `KNOWN_ERROR_CODE` is the code of the example known error, composed with `knownErrorCodeOf` from the product, the
 * family and the id of the runbook; it is empty for a family that is not a runbook kind.
 *
 * @param answers - Resolved scaffold answers
 * @returns Token map seeded with the common metadata placeholders
 */
export function commonPlaceholders(answers: RunbookAnswers): Map<string, string> {
  const kind = answers.family.toUpperCase();
  return new Map<string, string>([
    [
      'KNOWN_ERROR_CODE',
      isRunbookKind(kind) ? knownErrorCodeOf(answers.product, kind, answers.id, EXAMPLE_KNOWN_ERROR) : '',
    ],
    ['RUNBOOK_ID', answers.id],
    ['METADATA_NAME', answers.metadataName],
    ['METADATA_DESCRIPTION', answers.description],
    ['METADATA_VERSION', answers.version],
    ['METADATA_TEAM', answers.team],
    ['METADATA_TAGS', formatTagsLiteral(answers.tags)],
  ]);
}
