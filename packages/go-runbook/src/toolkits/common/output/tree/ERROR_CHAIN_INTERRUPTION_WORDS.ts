import type { ErrorChainInterruptionReason } from '../../../../engine/index.js';

/** The text of each reason a chain stops at, for the chain lines and the coverage lines. */
export const ERROR_CHAIN_INTERRUPTION_WORDS: Readonly<Record<ErrorChainInterruptionReason, string>> = {
  skipped: 'non interrogato, identificatore mancante',
  unavailable: 'lettura non disponibile',
  incomplete: 'evidenza incompleta',
  failed: 'analisi fallita',
  cycle: 'ciclo',
};
