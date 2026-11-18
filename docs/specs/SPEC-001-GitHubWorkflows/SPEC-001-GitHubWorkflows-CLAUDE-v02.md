# SPEC-001 · Workflow GitHub più semplici e più veloci — v02

- Stato: **approvata** per D1, D2, D4 e D6 (18 novembre 2026); D3 e D5 in attesa della risposta del committente.
- Autore: Claude.
- Origine: la richiesta del committente del 18 novembre 2026: «ottimizziamo, razionalizziamo e miglioriamo tutti
  workflow, actions, job etc di github. Togliamo ciò che non serve, ottimizziamo e riduciamo i tempi, introduciamo
  dove è necessario e può migliorare». Le misure, le cause e la proposta sono mie.

## 1. Perché

La CI impiega **10–14 minuti** per ogni push su `develop` e per ogni PR, anche quando il lavoro vero dura molto meno.
Le misure vengono dai run `44292674106` (push su `develop`, 13,1 minuti) e `44282044685` (PR, 10,3 minuti) del
18 novembre 2026.

### 1.1 Il tempo se ne va nell'artefatto della build

| Job                       | Lavoro vero                  | Attesa sull'artefatto               |
| ------------------------- | ---------------------------- | ----------------------------------- |
| Build                     | `pnpm build`: 21–33 s        | upload `workspace-build`: 271–405 s |
| Test                      | `pnpm test`: 22–27 s         | download: 45–49 s                   |
| Coverage                  | `pnpm test:coverage`: < 10 s | download 41–44 s, upload 49–62 s    |
| Published Packages        | gate statici: 51–73 s        | download: 40–50 s                   |
| Published Packages (pack) | pack: 10–15 s                | download: 29–48 s                   |

La causa è il percorso dell'artefatto: `packages/**/dist` e `scripts/**/dist` scendono anche nei `node_modules` dei
package, che pnpm collega con link simbolici, e l'upload li segue. Sul mio checkout il glob trova **263.656 file**
seguendo i link e **9.899** senza. Rifare la build in un job costa 21–33 s; scaricarla ne costa 40–50.

L'artefatto `coverage-reports` ha lo stesso problema e nessun workflow lo legge.

### 1.2 Lo smoke dei package pubblicati è sequenziale

Ogni cella della matrice (Node 22.19.0 e Node 24) esegue 21 scenari con npm e con pnpm, cioè 42 installazioni una
dopo l'altra: 190–230 s per cella. È il pezzo più lungo del percorso critico dopo l'artefatto.

### 1.3 Troppi job per poco lavoro

La CI apre 17 runner (15 job più 2 celle). Sette controlli statici (format, knip, grafo delle dipendenze,
duplicazione, type coverage, scaffold, classi nuove) durano 13–31 s ciascuno, di cui 10–15 s di preparazione
(checkout, pnpm, Node, installazione). Il workflow riutilizzabile `ci-job.yml` esiste solo per non ripetere quella
preparazione, che però sta già nell'action `setup-ci`.

### 1.4 Ciò che non serve o non funziona

- **`merge_group`**: la CI lo ascolta, ma il repository non usa la merge queue (nessun run `merge_group`, nessuna
  regola). Lo stesso vale per il ramo `merge_group` del controllo delle classi nuove.
- **`checks: write`**: nessun job scrive check run.
- **macOS Smoke**: compila solo `go-common` su macOS. `tsc` non dipende dal sistema operativo, e chi sviluppa su macOS
  compila tutto, non solo `go-common`, ogni giorno.
- **Concorrenza**: `cancel-in-progress: true` vale anche per i push su `develop` e `main`; un merge annulla la CI del
  merge precedente, e quel commit resta senza esito (run `44166865714`, annullato il 17 novembre).
- **New Class Tests** esegue anche i test unitari del proprio controllo, che stanno meglio con gli altri test dei
  `bins` (`test:bins`), e ha un passo che stampa solo «salto fuori dalle PR».
- **`security.yml`**: il job delle licenze usa `actions/checkout@v7`, l'unico riferimento non fissato a uno SHA.
- **`init_monorepo_ci.sh`**, nella radice: installa e compila; nessun workflow, script o documento lo usa.
- **Commenti dei workflow** che citano le sezioni di un documento di progetto (`§10.2`, `§9.3.1`): la regola del
  repository vuole che i documenti di progetto non si citino nel codice né nei workflow.

### 1.5 Ciò che manca

- **Nessun controllo dei workflow**: un errore di sintassi, un'espressione sbagliata o uno script di shell fragile
  in un file `.github/workflows/*.yml` si scopre solo quando il workflow parte.
- **Due bot per le dipendenze**: Renovate per npm, Dependabot per le GitHub Actions. Due configurazioni, due stili
  di PR; delle ultime cinque PR di Dependabot quattro sono state chiuse senza merge.
- **`main` senza check obbligatori**: `develop` richiede `CI Success` e `Release Guards`; `main` nessuno dei due, e
  ammette i force push. `docs/RELEASING.md` (§8) li vuole obbligatori su entrambi i rami.

## 2. Che cosa vede chi usa il repository

- La CI di una PR passa da 10–14 minuti a **circa 3 minuti** (stima, §7).
- Il check obbligatorio resta **`CI Success`**, con lo stesso nome; `Release Guards` non cambia. Le regole dei rami
  non vanno toccate per i nomi.
- Nella PR si vedono meno job, con nomi chiari: `Static Checks`, `Lint`, `Build and Test`, `Published Packages`,
  `Published Packages (pack)`, gli shard dello smoke e `CI Success`. Dentro `Static Checks` ogni controllo è un passo
  a sé: falliscono tutti quelli che falliscono, non solo il primo.
- Un merge su `develop` non annulla più la CI del merge precedente.
- Le soglie, i gate e i controlli restano gli stessi; nessuno si allenta.

## 3. La CI (`ci.yml`)

### 3.1 I job

| Job                                      | Passi                                                                                                                                                | Installazione               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Static Checks**                        | `format:check`, `knip`, `deps:check`, `dup:report`, `type-coverage`, `validate:scaffold`, actionlint (§3.4), `check:new-class-tests` (solo nelle PR) | `--ignore-scripts`          |
| **Lint**                                 | `lint`                                                                                                                                               | completa                    |
| **Build and Test**                       | `build`, `test`, `test:coverage` con le soglie di oggi (righe 90, rami 80, funzioni 90)                                                              | completa (`better-sqlite3`) |
| **Published Packages**                   | `build`, `test:published:static` con `IMPORT_COST_TIME_FACTOR=2`                                                                                     | `--ignore-scripts`          |
| **Published Packages (pack)**            | `build`, la matrice dello smoke (§3.2), il pack, l'upload di `published-tarballs`                                                                    | `--ignore-scripts`          |
| **Published Packages (Node _n_, _i_/3)** | gli scenari dello shard dagli archivi                                                                                                                | `--ignore-scripts`          |
| **CI Success**                           | fallisce se un job richiesto non è `success`                                                                                                         | nessuna                     |

- **Niente più artefatto della build**: ogni job che ne ha bisogno compila da sé (§1.1). Restano solo gli archivi
  `.tgz` del pack, piccoli, che lo smoke deve provare così come si pubblicano.
- **`ci-job.yml` sparisce**: i job sono pochi e diversi, e la preparazione comune sta già in `setup-ci`.
- **Static Checks**: ogni passo ha `if: ${{ !cancelled() }}`, così un formato sbagliato non nasconde un problema di
  knip. Il commento che spiega perché si usa `dup:report` e non `dup:check` resta.
- **Build and Test** unisce `Build`, `Test` e `Coverage`: i test con coverage durano meno di 10 s, e un job in più
  costava una preparazione e una build.
- **`check:new-class-tests:test`** entra in `test:bins` (in `package.json`), insieme ai test degli altri `bins`; in
  Static Checks resta solo il controllo sulle PR, contro il ramo base.
- **CI Success** non elenca più i risultati a mano: controlla `needs.*.result`. Un job nuovo basta aggiungerlo a
  `needs`.

### 3.2 Lo smoke a shard

`check:published-packages --print-node-matrix` accetta `--shards <n>`: divide gli scenari di ogni versione di Node in
_n_ gruppi consecutivi di dimensione quasi uguale, e ogni cella porta il suo shard (`"shard": "1/3"`). Senza
`--shards` il risultato è quello di oggi, con un solo shard per cella.

La CI usa 3 shard: 2 versioni di Node × 3 shard = 6 celle da circa 14 installazioni ciascuna, 60–80 s invece di
190–230. Gli scenari, i package manager e le versioni di Node restano gli stessi: cambia solo come si dividono tra i
runner. Il conteggio dei sottopercorsi senza scenario resta nel pack, che vede tutti gli scenari.

Il cambiamento sta in `bins/check-published-packages` (`nodeMatrix.ts`, il tipo `NodeMatrixCell`, l'opzione in
`index.ts`) con il suo test in `engineViolations.test.ts`.

### 3.3 Eventi, permessi e concorrenza

- Eventi: `push` e `pull_request` su `main` e `develop`. Via `merge_group`.
- Permessi: solo `contents: read`.
- Concorrenza: gruppo per PR o per ramo; `cancel-in-progress` solo per le PR. Un push nuovo sulla stessa PR annulla
  il run vecchio; un merge su `develop` no.
- Ogni checkout ha `persist-credentials: false`, salvo dove il job deve poi usare git con le credenziali (il rilascio
  che spinge i tag e `Release Guards`, che scarica la PR).
- I commenti dei workflow spiegano il perché senza citare documenti di progetto; dove serve, rimandano a
  `docs/RELEASING.md` o a `docs/PUBLISHED_PACKAGES_CHECKS.md`.

### 3.4 Il controllo dei workflow

Un passo di Static Checks esegue **actionlint** 1.7.12 dall'immagine Docker ufficiale, fissata al digest
(`rhysd/actionlint@sha256:b1934ee5…9315667`). Controlla la sintassi dei workflow e delle action, le espressioni, i
riferimenti a input e output, e passa gli script `run:` a ShellCheck, che l'immagine contiene. Prima del merge i
workflow di questa specifica devono passarlo senza eccezioni.

## 4. Gli altri workflow

- **`release.yml`, `release-guards.yml`, `release-audit.yml`**: la logica non cambia. Si tolgono i riferimenti alle
  sezioni del documento di progetto nei commenti e si aggiunge `persist-credentials: false` dove git non serve dopo
  il checkout (`version-pr` lo ha già; `audit` legge i tag con il clone completo, che non chiede credenziali in un
  repository pubblico).
- **`security.yml`**: `actions/checkout` fissato allo SHA come negli altri workflow; `persist-credentials: false`;
  concorrenza per PR. I due passi di `pnpm audit` restano: il primo mostra le vulnerabilità alte senza fermare, il
  secondo ferma su quelle critiche.
- **`setup-ci`**: nessun cambiamento.

## 5. Dipendenze e file di supporto

- **Dependabot → Renovate** (D2): Renovate aggiorna anche le GitHub Actions, con le PR raggruppate, gli SHA fissati e
  il commento con la versione, come oggi. `.github/dependabot.yml` sparisce; `renovate.json` aggiunge il manager
  `github-actions` a `enabledManagers` e una regola che raggruppa le action. Gli avvisi di sicurezza di GitHub
  (Dependabot alerts) restano, perché non dipendono da quel file.
- **`init_monorepo_ci.sh`** sparisce se il committente lo conferma (D3).
- **Documentazione**: si allineano `docs/ARCHITECTURE.md` (albero di `.github/` e tabella dei componenti),
  `docs/SCRIPTS.md` (sezione della CI), `docs/TESTING_STRATEGY.md`, `docs/PUBLISHED_PACKAGES_CHECKS.md` (i job dello
  smoke e gli shard), `docs/QUALITY_GATES_COMPARISON.md` (elenco dei job, macOS, `merge_group`, Dependabot),
  `docs/CHECK_LICENSE_REPORT.md` se cambia il testo sul job, `README.md` (riga su Dependabot) e `CLAUDE.md`
  (la sezione sulle specifiche, §6).

## 6. Le specifiche nel repository

Questa specifica apre `docs/specs/`, con le stesse regole di go-watchtower-pro:

- una cartella per specifica, `SPEC-<NNN>-<Argomento>`, con i file `SPEC-<NNN>-<Argomento>-<AUTORE>-v<NN>.md`;
- una versione nuova, o la proposta di un altro autore, è un file nuovo; il registro è
  `SPEC-<NNN>-<Argomento>-REVIEW-LOG.md`;
- le specifiche non si citano nel codice, nei commenti, nei test, nei workflow, nei changeset o nei commit.

`docs/specs/README.md` descrive la struttura e la forma di una versione. `CLAUDE.md` ottiene una sezione breve che
rimanda lì. I documenti di `docs/evolutions/` restano come archivio storico.

## 7. Stima dei tempi

Dalle misure del §1, con 15–20 s di preparazione per job:

| Percorso                  | Oggi            | Dopo                           |
| ------------------------- | --------------- | ------------------------------ |
| Build → artefatto → smoke | 8–11 min        | pack ~1,2 min + shard ~1,5 min |
| Lint                      | 2–2,4 min       | invariato                      |
| Build and Test            | build + 2 min   | ~1,5–2 min                     |
| Published Packages        | build + 2,5 min | ~2–2,5 min                     |
| **CI completa**           | **10–14 min**   | **~3 min**                     |
| Runner per run            | 17              | 11                             |

La stima va confermata dal primo run della PR; il registro riporterà i tempi misurati.

## 8. Test e verifica

- Il test di `nodeMatrix` prova gli shard: con 1 shard il risultato di oggi; con 3 shard ogni scenario sta in uno e
  un solo shard della sua versione di Node, gli shard differiscono al più di uno scenario e nessuno è vuoto.
- actionlint sui workflow, in locale con lo stesso digest, prima di aprire la PR.
- `pnpm build`, `pnpm test:bins`, `pnpm lint`, `pnpm format:check`, `pnpm knip` in locale.
- La PR stessa è la prova della CI: tutti i job verdi, `CI Success` verde, i tempi registrati nel registro.
- Un push di prova su un ramo con una modifica che rompe un controllo statico mostra il fallimento nel passo giusto
  e `CI Success` rosso (facoltativo, a giudizio del committente).

## 9. Fuori da questa specifica

- **Saltare la CI per le PR di sola documentazione.** Valutato e scartato: con la CI a circa 3 minuti il guadagno
  è piccolo, e un filtro sui percorsi deve comunque far passare `CI Success`, che è obbligatorio.
- **Cache di ESLint.** Scartata: le regole con informazioni di tipo dipendono da altri file, e la cache darebbe
  risultati vecchi.
- **Cache remota della build (Turborepo, Nx).** Scartata: la build dura 21–33 s.
- **zizmor** (analisi di sicurezza dei workflow): utile, ma segnala per natura il `pull_request_target` di
  `Release Guards`, che è voluto e documentato; si valuta a parte se il committente lo vuole (D5).
- **Release Audit rosso**: dal 18 novembre il controllo giornaliero fallisce perché la release PR #284, il cui
  rilascio era fallito, è stata superata dalla #288, che ha pubblicato le stesse versioni da un altro commit. Il
  difetto sta in `bins/check-release-state`, non nel workflow; va corretto in una specifica a parte (D4).
- **Le regole dei rami** sono impostazioni di GitHub, non file del repository: le cambia il committente. Per ora `main` resta com’è (D6).

## 10. Le scelte del committente (18 novembre 2026)

- **D1. macOS Smoke.** Si toglie («si togli»).
- **D2. Un solo bot per le dipendenze.** Renovate anche per le GitHub Actions; `.github/dependabot.yml` sparisce
  («sì»).
- **D3. `init_monorepo_ci.sh`.** Il committente ha chiesto a che cosa serve. Risposta: esegue `pnpm install`,
  `pnpm build:common` e `pnpm build:scripts`, un vecchio avvio locale che nessun workflow, script o documento
  richiama. Proposta invariata: toglierlo. In attesa della conferma.
- **D4. Release Audit.** Si corregge in una specifica a parte, SPEC-002 («ok»); il workflow resta com’è.
- **D5. zizmor.** Il committente ha chiesto a che cosa serve. Risposta: è un analizzatore di sicurezza dei workflow
  (credenziali lasciate nel checkout, permessi troppo larghi, iniezione di espressioni `${{ }}` negli script,
  trigger pericolosi, action non fissate). Proposta invariata: non ora. In attesa della risposta.
- **D6. Regole di `main`.** Per ora non si toccano («lascia stare il main per il momento»).
