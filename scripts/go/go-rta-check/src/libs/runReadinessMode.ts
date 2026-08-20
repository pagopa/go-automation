import type { Core } from '@go-automation/go-common';
import type { ShadowCapabilityReport } from '@go-automation/go-watchtower-client';

import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import { resolveClient } from './resolveClient.js';
import type { Connection } from './resolveClient.js';
import { COVERAGE_EXIT_CODES, runCoverageCheck } from './runCoverageCheck.js';
import type { CoverageExitCode } from './runCoverageCheck.js';

type ResolveConnectionFn = (script: Core.GOScript, config: GoRtaCheckConfig) => Promise<Connection | undefined>;

interface ReadinessModeDependencies {
  readonly resolveConnection: ResolveConnectionFn;
  readonly runCheck: typeof runCoverageCheck;
}

const DEFAULT_DEPENDENCIES: ReadinessModeDependencies = {
  resolveConnection: resolveClient,
  runCheck: runCoverageCheck,
};

const DEFAULT_WINDOW_DAYS = 14;

/**
 * Gate di attivazione di `APPLY_KNOWN` per scope limitato (Fase 5).
 *
 * Il gate ha **due** condizioni e nessuna delle due basta da sola:
 *
 * 1. la copertura statica passa — ogni riferimento dichiarato dai runbook esiste
 *    nel censimento del prodotto;
 * 2. lo shadow conferma sul campo — nella finestra osservata ogni known case
 *    valutato risulta `wouldApplyStatus = APPLIED`.
 *
 * Servono entrambe perché misurano cose diverse: la copertura dice che i nomi
 * *dichiarati* esistono, lo shadow che i casi *realmente incontrati* si
 * risolvono. Un runbook può superare la copertura e bloccare comunque su un
 * ramo che la copertura non sa di dover esercitare, ed è esattamente il caso in
 * cui attivare l'apply sposterebbe il problema nella coda di remediation.
 *
 * @param script - Script GO corrente
 * @param config - Configurazione dello script
 * @param dependencies - Dipendenze iniettabili per i test
 * @returns Exit code `0` se attivabile, `1` se non pronto, `2` su errore operativo
 */
export async function runReadinessMode(
  script: Core.GOScript,
  config: GoRtaCheckConfig,
  dependencies: ReadinessModeDependencies = DEFAULT_DEPENDENCIES,
): Promise<CoverageExitCode> {
  const logger = script.logger;
  try {
    const connection = await dependencies.resolveConnection(script, config);
    if (connection === undefined) {
      logger.error('Readiness non eseguibile: connessione Watchtower non disponibile.');
      return COVERAGE_EXIT_CODES.NOT_EXECUTABLE;
    }

    logger.section('1. Copertura statica');
    const coverage = await dependencies.runCheck(logger, connection.client);
    const coverageOk = coverage.exitCode === COVERAGE_EXIT_CODES.OK;
    logger.info(coverageOk ? 'Copertura: nessun riferimento mancante.' : 'Copertura: riferimenti mancanti o errori.');

    logger.section('2. Shadow osservato');
    const windowDays = config.readinessWindowDays ?? DEFAULT_WINDOW_DAYS;
    const report = await connection.client.getShadowReport({
      days: windowDays,
      ...(config.productId === undefined ? {} : { productId: config.productId }),
    });
    logger.info(`Finestra: ${windowDays} giorni · capability osservate: ${report.totalCapabilities}`);

    for (const capability of report.capabilities) renderCapability(logger, capability);

    const notReady = report.capabilities.filter((capability) => !capability.ready);
    const shadowOk = report.totalCapabilities > 0 && notReady.length === 0;

    logger.section('Esito');
    if (report.totalCapabilities === 0) {
      // Nessun dato non è un via libera: è assenza di evidenza.
      logger.warning('Nessuna capability valutata nella finestra: lo shadow non ha ancora prodotto evidenza.');
    }
    if (!coverageOk) logger.warning('Copertura statica non superata.');
    for (const capability of notReady) {
      logger.warning(
        `Non pronta: ${capability.productName}/${capability.runbookKey ?? '—'} (${capability.wouldBlock} blocchi)`,
      );
    }

    if (coverageOk && shadowOk) {
      logger.success(
        `APPLY_KNOWN attivabile: ${report.readyCapabilities}/${report.totalCapabilities} capability pronte.`,
      );
      return COVERAGE_EXIT_CODES.OK;
    }
    logger.error('APPLY_KNOWN non attivabile: risolvere i punti sopra e rimisurare.');
    return COVERAGE_EXIT_CODES.INVALID_COVERAGE;
  } catch (error) {
    logger.error(`Readiness non completata: ${error instanceof Error ? error.message : String(error)}`);
    return COVERAGE_EXIT_CODES.NOT_EXECUTABLE;
  }
}

function renderCapability(logger: Core.GOLogger, capability: ShadowCapabilityReport): void {
  const label = `${capability.productName}/${capability.runbookKey ?? '—'}`;
  const verdict = capability.ready ? 'PRONTA' : 'NON PRONTA';
  logger.info(
    `${verdict} · ${label} · valutate ${capability.evaluated}, applicherebbero ${capability.wouldApply}, bloccherebbero ${capability.wouldBlock}`,
  );
  for (const [code, count] of Object.entries(capability.blockedByCode)) {
    logger.info(`    ${code}: ${count}`);
  }
  if (capability.unresolvedReferences.length > 0) {
    logger.info(`    da censire: ${capability.unresolvedReferences.join(', ')}`);
  }
  if (capability.contextInvalid > 0) {
    logger.info(`    contesti unknown non validi: ${capability.contextInvalid}`);
  }
}
