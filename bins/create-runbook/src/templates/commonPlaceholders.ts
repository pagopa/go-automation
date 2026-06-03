import type { RunbookAnswers } from './RunbookAnswers.js';
import { formatTagsLiteral } from './formatTagsLiteral.js';

/**
 * Builds the placeholder tokens shared by every runbook template.
 *
 * Returns a fresh mutable map so template-specific builders can extend it
 * without sharing state across runs.
 *
 * @param answers - Resolved scaffold answers
 * @returns Token map seeded with the common metadata placeholders
 */
export function commonPlaceholders(answers: RunbookAnswers): Map<string, string> {
  return new Map<string, string>([
    ['RUNBOOK_ID', answers.id],
    ['BUILDER_NAME', answers.builderName],
    ['METADATA_NAME', answers.metadataName],
    ['METADATA_DESCRIPTION', answers.description],
    ['METADATA_VERSION', answers.version],
    ['METADATA_TEAM', answers.team],
    ['METADATA_TAGS', formatTagsLiteral(answers.tags)],
  ]);
}
