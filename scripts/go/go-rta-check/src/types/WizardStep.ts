/**
 * Outcome of one step of the interactive selection.
 *
 * `interactive` tells the orchestrator whether the step actually asked
 * something: only an interactive step is a valid "back" destination.
 *
 * `CANCELLED` and `FAILED` both stop the wizard, but they are not the same
 * event: the first is a deliberate abort by the user, the second is an error
 * whose reason has already been logged. Only the second must fail the run.
 */
export type WizardStep<T> =
  | { readonly kind: 'VALUE'; readonly value: T; readonly interactive: boolean }
  | { readonly kind: 'BACK' }
  | { readonly kind: 'CANCELLED' }
  | { readonly kind: 'FAILED' };
