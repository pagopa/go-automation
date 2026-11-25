/**
 * The second gate, in front of a write that reaches production.
 *
 * `confirmWrite` is a yes/no that `--yes` answers up front, which is right for
 * a test account and too little for production: one keystroke, or one flag
 * left in a shell history, is all that separates the operator from a prod
 * purge. So a production write also has to be confirmed by typing the target
 * back, and nothing but a human at a terminal can do that:
 *
 * - there is deliberately no `assumeYes` here. `--yes`, an env var, a preset
 *   or a config file can answer the first question, never this one;
 * - with no terminal the run throws, so a production write can never run
 *   unattended — not from CI, not from a chain step without a TTY;
 * - a dry run writes nothing and asks nothing.
 */

import { GOError } from '@pagopa/go-common/errors';
import { GOLogger } from '@pagopa/go-common/logging';

import { confirmWrite } from './confirmWrite.js';
import type { GOWriteConfirmationRequest } from './confirmWrite.js';
import { GOPrompt } from './GOPrompt.js';
import { isProductionTarget } from './productionTarget.js';
import type { GOProductionTarget } from './productionTarget.js';

/** What a production write is about to do, and to what. */
export interface GOProductionWriteRequest {
  /** The question put to the operator, before they type the target back */
  readonly question: string;

  /** Everything the write touches; the gate only engages for the production ones */
  readonly targets: ReadonlyArray<GOProductionTarget>;

  /** Whether this run writes nothing */
  readonly isDryRun: boolean;

  /** Whether there is a terminal to ask */
  readonly canPromptUser: boolean;
}

/** Both gates at once: the yes/no that `--yes` may answer, then the typed one. */
export interface GOWriteWithProductionRequest extends GOWriteConfirmationRequest {
  /** Everything the write touches */
  readonly targets: ReadonlyArray<GOProductionTarget>;
}

/** Error code carried when a production write has no human at a terminal to confirm it. */
export const GO_PROD_WRITE_NEEDS_OPERATOR: string = 'GO_PROD_WRITE_NEEDS_OPERATOR';

/**
 * Asks the operator to type every production target back before the write.
 *
 * @param prompt - Prompt used to ask the operator
 * @param logger - Logger used to report the decision
 * @param request - What is about to happen, and to what
 * @returns True when the write may proceed, false when the operator left the prompt
 * @throws GOError when a production write has nobody at a terminal to confirm it
 */
export async function confirmProductionWrite(
  prompt: GOPrompt,
  logger: GOLogger,
  request: GOProductionWriteRequest,
): Promise<boolean> {
  if (request.isDryRun) return true;

  const production = request.targets.filter(isProductionTarget);
  if (production.length === 0) return true;

  const labels = production.map((target) =>
    target.unresolved === true ? `${target.label} (account not resolved)` : target.label,
  );
  const typedLabels = production.map((target) => target.label);
  if (!request.canPromptUser) {
    throw new GOError(
      `This run would write to production (${labels.join(', ')}), and a production write needs an operator ` +
        'at a terminal to type the target back. Nothing can approve it up front: run it interactively.',
      { code: GO_PROD_WRITE_NEEDS_OPERATOR, context: { question: request.question, targets: labels } },
    );
  }

  logger.warning(`PRODUCTION write: ${request.question}`);
  for (const label of typedLabels) {
    const answer = await prompt.text(`Type "${label}" to confirm the write to production:`, {
      validate: (value) => value.trim() === label || `Type exactly "${label}", or press Esc to cancel.`,
    });

    if (answer?.trim() !== label) {
      logger.warning('Production write cancelled by user.');
      return false;
    }
  }

  return true;
}

/**
 * The one entry point for a writer: `confirmWrite`, then the production gate.
 *
 * @param prompt - Prompt used to ask the operator
 * @param logger - Logger used to report the decision
 * @param request - What is about to happen, to what, and what may be assumed
 * @returns True when the write may proceed, false when it was declined at either gate
 * @throws GOError when a real write, or any production write, has nobody to confirm it
 */
export async function confirmWriteWithProduction(
  prompt: GOPrompt,
  logger: GOLogger,
  request: GOWriteWithProductionRequest,
): Promise<boolean> {
  if (!(await confirmWrite(prompt, logger, request))) return false;

  return await confirmProductionWrite(prompt, logger, request);
}
