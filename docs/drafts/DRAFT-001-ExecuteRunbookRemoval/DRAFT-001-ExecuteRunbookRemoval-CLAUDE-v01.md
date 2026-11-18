# DRAFT-001 — Rimozione della catena execute-runbook da go-automation

- **Stato**: aperta
- **Autore**: CLAUDE
- **Data**: 2026-11-18
- **Origine**: domanda del committente: «se faccio un progetto Lambda in Watchtower che referenzia `go-runbook`, che
  cosa possiamo eliminare da go-automation?»
- **Collegata a**: [DRAFT-002 — Client Watchtower condiviso](../DRAFT-002-SharedWatchtowerClient/DRAFT-002-SharedWatchtowerClient-CLAUDE-v01.md)

## 1. Perché

Con la pubblicazione di `@pagopa/go-runbook` su GitHub Packages, l'esecuzione automatica dei runbook per Watchtower
può vivere in una Lambda dentro go-watchtower-pro, che importa i runbook dal package pubblicato. Una volta fatto,
go-automation tiene ancora l'intera catena attuale (adattatore SQS, script del ciclo di vita, infrastruttura SST,
contratti di catalogo e code, deploy dell'ambiente): codice, configurazione e documentazione che nessuno userebbe più.

## 2. Che cosa sappiamo

Verificato sul codice il 2026-11-18.

La catena attuale è: coda SQS → `functions/go-ExecuteRunbookLambda` → `scripts/go/go-execute-runbook` (sottopercorsi
`/api` e `/config`), deployata da `infra/watchtower-alarm-analysis` con SST. Il catalogo automatico e il registro delle
code si pubblicano con `bins/deploy-execute-runbook-environment`.

Nessun altro pezzo del repository dipende da questa catena:

| Pezzo                                         | Lo usano                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `scripts/go/go-execute-runbook`               | solo `go-ExecuteRunbookLambda`, l'infra SST, `bins/deploy-execute-runbook-environment` |
| `packages/go-execute-runbook-contracts`       | solo l'infra SST e il bin di deploy                                                    |
| Metodi di scrittura di `go-watchtower-client` | solo `go-execute-runbook`                                                              |

La Lambda e il catalogo automatico non sono mai stati rilasciati in produzione: non c'è un catalogo da migrare né una
coda da svuotare.

## 3. L'idea

### 3.1 Che cosa si elimina

| Cosa                                                                                                                                                                                                                                                                                                                                                         | Perché                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `functions/go-ExecuteRunbookLambda`                                                                                                                                                                                                                                                                                                                          | Adattatore SQS di `go-execute-runbook`, sostituito dalla Lambda in Watchtower.  |
| `scripts/go/go-execute-runbook`                                                                                                                                                                                                                                                                                                                              | Ciclo di vita dell'esecuzione (start/progress/complete/fail verso Watchtower).  |
| `infra/watchtower-alarm-analysis` (`go-execute-runbook-infra`)                                                                                                                                                                                                                                                                                               | Coda, DLQ, worker e monitoraggio della Lambda attuale.                          |
| `packages/go-execute-runbook-contracts`                                                                                                                                                                                                                                                                                                                      | Schemi del catalogo automatico e del registro delle code.                       |
| `bins/deploy-execute-runbook-environment`                                                                                                                                                                                                                                                                                                                    | Pubblicazione del catalogo e dell'ambiente per la Lambda attuale.               |
| `contracts/runbook-automation/v1`: schemi `automatic-runbook-catalog-v1` ed `execute-runbook-queue-registry-v1`, fixture, `owned/`, voci del manifest                                                                                                                                                                                                        | Contratti di catalogo e code della Lambda attuale.                              |
| Metodi di scrittura di `go-watchtower-client`: `startExecution`, `progressExecution`, `completeExecution`, `failExecution`, `acknowledgeCancellation`, `cancelExecution`, `createCliAutomaticRunbookExecution`, `previewCliAutomaticRunbookExecution`, `getAutomaticRunbookExecution`, `getAutomaticRunbookAttempts`, `parseAutomaticAlarmAnalysisCommandV1` | Li usa solo `go-execute-runbook`. Se si fa DRAFT-002 se ne va tutto il package. |

### 3.2 Riferimenti da ripulire

- `package.json` (radice): `deploy:execute-runbook`, `deploy:execute-runbook:environment`,
  `deploy:execute-runbook:environment:test`, `diff:execute-runbook`, `catalog:automatic:build-local` e il passo
  `tsc -p bins/deploy-execute-runbook-environment` dentro `build:ts`.
- `tsconfig.json`: i riferimenti alle quattro cartelle.
- `knip.config.ts` (voce di `go-execute-runbook-contracts`) ed `eslint.config.mjs` (blocco dei contracts).
- `pnpm-lock.yaml`: si rigenera con `pnpm install`.
- Documentazione: `infra/README.md`, `docs/DEPLOY.md`, `docs/ARCHITECTURE.md`, `docs/RUNBOOKENGINE.md`,
  `docs/TESTING_STRATEGY.md`, `docs/AWS_LOGICAL_ACCOUNTS.md`. I documenti di `docs/evolutions/` restano come archivio.

### 3.3 Che cosa resta

- `@pagopa/go-runbook`, `@pagopa/go-common`, `@pagopa/go-aws`: sono ciò che la Lambda in Watchtower importa. Restano
  anche `AnalysisDraft`/`buildAnalysisDraft` e `cloudExecutionPolicy`, che fanno parte dell'output e dell'inventario
  dei runbook.
- `go-watchtower-client` nella parte in sola lettura, finché non si fa DRAFT-002: lo usano `go-rta-check` e
  `go-watchtower-runbook`.
- `go-watchtower-runbook`, `go-rta-check`, `go-analyze-alarm`: strumenti locali, indipendenti dalla Lambda.
- `init_monorepo_ci.sh` (lo usa CodeBuild, fuori dal repository) e le altre Lambda di `functions/`.

## 4. Che cosa manca per farla

1. La Lambda in go-watchtower-pro esiste, importa `@pagopa/go-runbook` ed esegue i runbook automatici al posto di
   `go-ExecuteRunbookLambda`.
2. Lo stack SST di `infra/watchtower-alarm-analysis`, se è stato deployato in qualche stage di sviluppo, è stato
   rimosso con `sst remove` **prima** di cancellare il codice; altrimenti coda, DLQ e Lambda restano orfane su AWS.
3. È deciso dove si genera il catalogo dei runbook automatici (oggi `bins/deploy-execute-runbook-environment`).

## 5. Domande aperte

- **Q1**: l'avvio e l'anteprima di un'esecuzione da riga di comando (`createCli…`/`previewCliAutomaticRunbookExecution`
  in `go-execute-runbook`) servono ancora? Se sì, chi li offre dopo la rimozione: la Lambda in Watchtower, la sua
  interfaccia, o uno script che resta in go-automation?
- **Q2**: il catalogo dei runbook automatici lo genera Watchtower leggendo `./inventory` di `@pagopa/go-runbook`, o
  go-automation continua a pubblicarlo?
- **Q3**: la rimozione si fa in un colpo solo, quando la Lambda in Watchtower è in esercizio, o a passi (prima la
  Lambda e l'infra, poi contratti e client)?
