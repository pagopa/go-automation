/**
 * The `--yes` every writer declares, declared once.
 *
 * Fifteen scripts had a copy of this parameter, and none of them stopped an
 * exported `YES=true`, a preset or a config file from answering for the
 * operator. It is `cliOnly` here, so the approval has to be typed on the
 * command line of the run it approves.
 */

import type { GOConfigParameterOptions } from './GOConfigParameter.js';
import { GOConfigParameterType } from './GOConfigParameterType.js';

/**
 * Builds the `--yes` parameter, which answers the yes/no confirmation of a write.
 *
 * It never answers the typed confirmation in front of a production write.
 *
 * @param description - What the flag skips, in the script's own terms
 * @returns The parameter declaration
 */
export function yesParameter(description: string): GOConfigParameterOptions {
  return {
    name: 'yes',
    type: GOConfigParameterType.BOOL,
    description,
    required: false,
    defaultValue: false,
    aliases: ['y'],
    cliOnly: true,
  };
}
