/**
 * Single-choice prompt that scales with the number of options.
 */
import type { Core } from '@go-automation/go-common';

/** Above this many options a plain list stops being readable: switch to search. */
const AUTOCOMPLETE_THRESHOLD = 12;
/** Options shown at once by the searchable prompt. */
const AUTOCOMPLETE_PAGE_SIZE = 12;

/** Reserved value returned by the "go back" entry of a prompt. */
export const BACK_CHOICE = '\u0000back';

/**
 * Asks the user to pick one option, using a plain list for short menus and a
 * type-to-filter search for long ones (the runbook list grows with the catalog).
 *
 * @param script - GOScript instance owning the prompt
 * @param message - Prompt message
 * @param choices - Options to offer, already in display order
 * @returns The selected value, or `undefined` when the user aborts (already reported)
 *
 * @example
 * ```typescript
 * const alarmName = await promptChoice<string>(script, 'Seleziona il runbook', choices);
 * ```
 */
export async function promptChoice<T>(
  script: Core.GOScript,
  message: string,
  choices: ReadonlyArray<Core.GOPromptSelectOption>,
): Promise<T | undefined> {
  const answer = await askChoice<T>(script, message, choices);
  // The only abort the caller cannot explain: every other one logs its own
  // reason, so reporting it here keeps the caller from guessing.
  if (answer === undefined) script.logger.warning('Selezione annullata.');
  return answer;
}

async function askChoice<T>(
  script: Core.GOScript,
  message: string,
  choices: ReadonlyArray<Core.GOPromptSelectOption>,
): Promise<T | undefined> {
  const options = [...choices];
  if (options.length <= AUTOCOMPLETE_THRESHOLD) {
    return await script.prompt.select<T>(message, options);
  }
  return await script.prompt.autocomplete<T>(`${message} (digita per filtrare)`, options, {
    limit: AUTOCOMPLETE_PAGE_SIZE,
    suggest: async (input, all) => Promise.resolve(filterChoices(input, all)),
  });
}

/** Case-insensitive substring filter over title and description. */
function filterChoices(input: string, choices: ReadonlyArray<Core.GOPromptSelectOption>): Core.GOPromptSelectOption[] {
  const term = input.trim().toLowerCase();
  if (term === '') return [...choices];
  return choices.filter((choice) => {
    if (choice.value === BACK_CHOICE) return true;
    const haystack = `${choice.title} ${choice.description ?? ''}`.toLowerCase();
    return haystack.includes(term);
  });
}
