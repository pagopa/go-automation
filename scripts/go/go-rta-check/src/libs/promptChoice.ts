/**
 * Single-choice prompt that scales with the number of options.
 */
import { Core } from '@go-automation/go-common';

/** Above this many options a plain list stops being readable: switch to search. */
const AUTOCOMPLETE_THRESHOLD = 12;
/** Options shown at once by the searchable prompt. */
const AUTOCOMPLETE_PAGE_SIZE = 12;

/** Reserved value returned by the "go back" entry of a prompt. */
export const BACK_CHOICE = '\u0000back';

/** Told to the user only where the shortcut is actually active. */
export const BACK_SHORTCUT_HINT = ' · premi ←';
/** In the searchable prompt ← only goes back while there is no query to navigate. */
const SEARCH_BACK_SHORTCUT_HINT = ' · premi ← a filtro vuoto';

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
  // Only menus offering the entry can honour the shortcut: it stands for that
  // entry, so without it there is nowhere to go back to.
  const hasBack = options.some((choice) => choice.value === BACK_CHOICE);

  if (options.length > AUTOCOMPLETE_THRESHOLD) {
    const searchMessage = `${message} (digita per filtrare)`;
    const searchOptions: Core.GOPromptAutocompleteOptions = {
      limit: AUTOCOMPLETE_PAGE_SIZE,
      suggest: async (input, all) => Promise.resolve(filterChoices(input, all)),
    };
    if (!hasBack) return await script.prompt.autocomplete<T>(searchMessage, options, searchOptions);

    return resolveBack(
      await script.prompt.autocompleteWithBack<T>(
        searchMessage,
        withBackShortcutHint(options, SEARCH_BACK_SHORTCUT_HINT),
        searchOptions,
      ),
    );
  }

  if (!hasBack) return await script.prompt.select<T>(message, options);

  return resolveBack(await script.prompt.selectWithBack<T>(message, withBackShortcutHint(options, BACK_SHORTCUT_HINT)));
}

/** Turns the shortcut sentinel into the value of the entry it stands for. */
function resolveBack<T>(answer: T | typeof Core.GO_PROMPT_BACK | undefined): T | undefined {
  // Safe: the caller compares the answer with BACK_CHOICE, the very value the
  // entry this shortcut stands for carries.
  return answer === Core.GO_PROMPT_BACK ? (BACK_CHOICE as T) : answer;
}

/** Announces the keyboard shortcut on the entry it triggers, and only there. */
function withBackShortcutHint(
  choices: ReadonlyArray<Core.GOPromptSelectOption>,
  hint: string,
): Core.GOPromptSelectOption[] {
  return choices.map((choice) =>
    choice.value === BACK_CHOICE ? { ...choice, title: `${choice.title}${hint}` } : choice,
  );
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
