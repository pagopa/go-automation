import type { CoverageExitCode } from './runCoverageCheck.js';
import { COVERAGE_EXIT_CODES } from './runCoverageCheck.js';

/**
 * Traduce il verdetto di un modo di sola lettura nell'exit code del processo.
 *
 * I due esiti diversi da zero significano cose diverse e vanno tenuti distinti:
 * `1` è un **verdetto** (ho misurato, non va bene), `2` è un **guasto** (non ho
 * potuto misurare). Confonderli farebbe passare per risposta un'assenza di dati.
 *
 * Il verdetto però esce dal processo solo se qualcuno lo sta interpretando. Da
 * terminale un exit code diverso da zero fa dire a pnpm che il comando è
 * fallito, subito dopo che lo script ha stampato la sua riga di successo: tre
 * righe che si contraddicono per un'esecuzione andata a buon fine. In CI serve
 * l'opposto, perché è l'exit code a fermare la pipeline.
 *
 * Il guasto invece esce **sempre**: non è un'opinione sul risultato, è il
 * fallimento del comando.
 *
 * @param verdict - Esito del modo eseguito
 * @param exitCodeOnFindings - `true` quando il chiamante interpreta l'exit code (CI)
 * @returns L'exit code da assegnare al processo
 */
export function resolveProcessExitCode(verdict: CoverageExitCode, exitCodeOnFindings: boolean): CoverageExitCode {
  if (verdict === COVERAGE_EXIT_CODES.NOT_EXECUTABLE) return verdict;
  if (verdict === COVERAGE_EXIT_CODES.INVALID_COVERAGE && !exitCodeOnFindings) {
    return COVERAGE_EXIT_CODES.OK;
  }
  return verdict;
}
