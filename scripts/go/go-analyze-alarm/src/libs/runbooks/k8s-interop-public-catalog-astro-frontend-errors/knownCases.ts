import type { KnownCase } from '@go-automation/go-runbook';

import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { interopKnownCase } from '../interop/interopKnownCases.js';
import { INTEROP_PUBLIC_CATALOG_VAR_PREFIX } from './resolveInteropAlarmContext.js';
import { QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, QUERY_INTEROP_CID_TRACKER_STEP_ID } from './runbookSteps.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
  cidTrackerStepId: QUERY_INTEROP_CID_TRACKER_STEP_ID,
  varPrefix: INTEROP_PUBLIC_CATALOG_VAR_PREFIX,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'public-catalog-invalid-uuid-syntax',
    description: 'UUID non valido nella query verso il database del public catalog',
    priority: 95,
    // Il valore dello uuid invalido varia tra le occorrenze: il pattern non lo vincola.
    regex: 'invalid input syntax for type uuid',
    resolution: 'Caso noto public catalog. Verificare riferimento PIN-8696; il valore dello uuid invalido può variare.',
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-undefined-length-type-error',
    description: "TypeError su proprietà 'length' di undefined nel public catalog frontend",
    priority: 90,
    regex: "TypeError: Cannot read properties of undefined \\(reading 'length'\\)",
    resolution: 'Caso noto public catalog. Verificare riferimento PIN-8718 (collegato a PIN-8836).',
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-astro-frontend-missing-env-files',
    description: 'Caricamento dei file .env fallito nel package astro-frontend',
    priority: 85,
    // Messaggio reale:
    // [dotenv-flow@4.1.0]: \".env*\" files loading failed: no \".env*\" files matching pattern \".env[.node_env][.local]\" in \"/app/packages/astro-frontend\" dir undefined
    // Le virgolette arrivano già escapate nei log e vengono escapate di nuovo dal confronto
    // JSON-stringificato: il pattern usa wildcard al loro posto e la versione non è vincolata.
    regex: '\\[dotenv-flow@[^\\]]+\\]: .*\\.env\\*.* files loading failed: no .*\\.env\\*.* files matching pattern',
    resolution:
      'Caso risolto con PIN-8733: se ricompare, verificare la configurazione dei file .env del M2M Event Cleaner.',
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-error-fetching-from-database',
    description: 'Errore di lettura dal database del public catalog',
    priority: 70,
    regex: 'Error fetching .* from the database',
    resolution:
      'Verificare riferimenti PIN-8836 e PIN-8718 (possibile duplicato). Raccogliere CID e log correlati dal trace.',
  }),
];
