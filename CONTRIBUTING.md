# Contribuire a go-automation

Questo è un repository interno, usato da un singolo team per automatizzare
procedure operative su GO (go-cli, runbook, script AWS/SEND). Questa guida è
proporzionata a quel contesto: non è pensata per contributor esterni.

## Prima di scrivere codice

`docs/` è la fonte di verità del progetto, non documentazione opzionale.
`CLAUDE.md` elenca quale documento leggere per quale area (es.
`docs/CONVENTIONS.md` prima di toccare `scripts/`, `docs/SCRIPTS.md` per la
struttura a 3 file, `docs/GUIDE_LINES.md` per lo standard TypeScript). Leggi
il documento pertinente prima di aprire un PR che tocca quell'area.

## Flusso di lavoro

1. Crea un branch da `develop` con un nome descrittivo (es.
   `feat/go-1234-descrizione-breve`).
2. Scrivi commit in inglese, in formato [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat(scope): ...`, `fix: ...`, `chore: ...`, `refactor: ...`,
   `docs: ...`, `test: ...`), coerentemente con lo storico del repository.
   Niente menzioni di co-autorship AI nei commit.
3. Prima di aprire una PR, esegui `pnpm verify` (lint, format, knip,
   dependency-check, duplication, type-coverage, scaffold validation, test
   sulle classi nuove). **`pnpm verify` non esegue `tsc -b`**: lancia anche
   `pnpm build` (o `pnpm type-check`) separatamente.
4. Titolo e descrizione della PR sono in italiano (termini tecnici in
   inglese ammessi), seguendo la struttura di
   `.github/pull_request_template.md`, che resta in inglese per gli heading
   e la checklist.
5. PR piccole e incrementali: una PR = un cambiamento logico. Le PR sono
   revisionate personalmente dal maintainer del progetto.

## Convenzioni di dettaglio

Per struttura degli script, layering fra `packages/`/`scripts/`/`functions/`,
regole ESLint non negoziabili (strict mode TypeScript, divieto di
reimplementare go-common, naming) e per l'elenco completo dei comandi di
build/test/quality: vedi `CLAUDE.md` in root e i documenti in `docs/`
elencati lì.

## Nota sul workflow git locale

Nel lavoro quotidiano di sviluppo su questo repository, è comune lavorare su
un branch locale (`sandbox`) senza counterpart remoto, per iterare senza
pubblicare lavoro intermedio. Push e apertura di PR restano un passo
esplicito, da eseguire quando il lavoro è pronto per la review — non
un'azione implicita di ogni sessione di sviluppo.
