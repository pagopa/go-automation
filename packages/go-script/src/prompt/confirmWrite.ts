/**
 * The one gate between deciding to write and writing.
 *
 * Ten scripts had grown their own copy of this rule, and three of them had it
 * wrong in the same way: with no terminal to ask and no `--yes`, `confirm`
 * resolves `undefined`, the copy read that as a refusal, and the run ended
 * with nothing written and **exit 0**. A chain step, or CI, then reports a
 * success for work it never did — `chains/send-release.yaml` would skip the
 * commit-id update and go on to update both stacks and start the pipelines
 * against the previous release.
 *
 * So the three outcomes are kept apart here, once, instead of being rebuilt
 * per script:
 *
 * - **approved** — `--yes`, or a human answered yes;
 * - **declined** — a human answered no, or pressed Esc. The caller decides
 *   what that is worth; it is a legitimate answer;
 * - **nobody to ask** — there is no terminal and the run would really write.
 *   That is not a refusal and must never read as success, so it throws.
 *
 * A dry run is the documented exception: it writes nothing, so where there is
 * nobody to ask there is also nothing to approve, and the preview proceeds.
 */

import { GOError } from '@pagopa/go-common/errors';
import { GOLogger } from '@pagopa/go-common/logging';

import { GOPrompt } from './GOPrompt.js';

/** What the caller is about to do, and what it may assume. */
export interface GOWriteConfirmationRequest {
  /** The question put to the operator */
  readonly question: string;

  /** Whether `--yes` was given, which approves without asking */
  readonly assumeYes: boolean;

  /** Whether this run writes nothing */
  readonly isDryRun: boolean;

  /** Whether there is a terminal to ask */
  readonly canPromptUser: boolean;
}

/** Error code carried when a real write has nobody to confirm it. */
export const GO_WRITE_NEEDS_CONFIRMATION: string = 'WRITE_NEEDS_CONFIRMATION';

/**
 * Decides whether a write may proceed.
 *
 * @param prompt - Prompt used to ask the operator
 * @param logger - Logger used to report the decision
 * @param request - What is about to happen, and what may be assumed
 * @returns True when the write may proceed, false when it was declined
 * @throws GOError when the run would write and there is nobody to ask
 */
export async function confirmWrite(
  prompt: GOPrompt,
  logger: GOLogger,
  request: GOWriteConfirmationRequest,
): Promise<boolean> {
  if (request.assumeYes) return true;

  if (!request.canPromptUser) {
    if (request.isDryRun) {
      logger.info('Dry run with no terminal to ask: proceeding with the preview, which writes nothing.');
      return true;
    }

    // Never a quiet `false`. A caller that treats this as a refusal reports a
    // clean run for work it did not do.
    throw new GOError(
      'This run would write, and there is no terminal to confirm it. Pass --yes to approve it up front, ' +
        'or run it where somebody can answer.',
      { code: GO_WRITE_NEEDS_CONFIRMATION, context: { question: request.question } },
    );
  }

  // `confirm` resolves `undefined` on Esc, which is a refusal and not a yes. Ctrl+C
  // never gets here: `GOPrompt` exits the process with 130.
  if ((await prompt.confirm(request.question, false)) !== true) {
    logger.warning('Operation cancelled by user.');
    return false;
  }

  return true;
}
