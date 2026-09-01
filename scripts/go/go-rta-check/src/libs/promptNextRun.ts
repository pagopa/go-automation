/**
 * Continuation menu shown after a runbook has been analysed.
 *
 * The analysis mode is a review session more often than a one-shot command, so
 * it offers another run instead of exiting: the Watchtower login and the reads
 * already paid for are reused, and only the steps the user wants to change are
 * asked again.
 */
import type { Core } from '@go-automation/go-common';

import type { NextRunChoice } from '../types/NextRunChoice.js';

/** Inputs deciding which continuations make sense. */
export interface PromptNextRunOptions {
  readonly script: Core.GOScript;
  /** Product of the run that just ended, named in the menu. */
  readonly productName: string;
  /**
   * Whether the product was actually chosen by the user.
   *
   * When it was not — a single product in scope, or `--product-id` — changing it
   * is not offered: the step would resolve to the very same product.
   */
  readonly canChangeProduct: boolean;
}

/**
 * Asks what to do next, listing only the continuations that would change something.
 *
 * @param options - Script, product just analysed and whether it can be changed
 * @returns The chosen continuation; an aborted prompt reads as `EXIT`
 *
 * @example
 * ```typescript
 * const next = await promptNextRun({ script, productName: 'SEND', canChangeProduct: true });
 * if (next === 'EXIT') return;
 * ```
 */
export async function promptNextRun(options: PromptNextRunOptions): Promise<NextRunChoice> {
  const choices: Core.GOPromptSelectOption[] = [
    { title: `Analizza un altro runbook di ${options.productName}`, value: 'SAME_PRODUCT' },
  ];
  if (options.canChangeProduct) {
    choices.push({ title: 'Analizza un runbook di un altro prodotto', value: 'CHANGE_PRODUCT' });
  }
  choices.push({ title: 'Esci', value: 'EXIT' });

  // An aborted prompt (Ctrl+C, ESC) is the user asking to stop: treating it as
  // anything else would keep the session alive against their intent.
  return (await options.script.prompt.select<NextRunChoice>('Cosa vuoi fare?', choices)) ?? 'EXIT';
}
