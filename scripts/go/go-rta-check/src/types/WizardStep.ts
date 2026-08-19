/**
 * Outcome of one step of the interactive selection.
 *
 * `interactive` tells the orchestrator whether the step actually asked
 * something: only an interactive step is a valid "back" destination.
 */
export type WizardStep<T> =
  | { readonly kind: 'VALUE'; readonly value: T; readonly interactive: boolean }
  | { readonly kind: 'BACK' }
  | { readonly kind: 'ABORT' };
