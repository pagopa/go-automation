# SPEC-001 · Registro delle revisioni

## La richiesta del committente

- 18 novembre 2026: «ottimizziamo, razionalizziamo e miglioriamo tutti workflow, actions, job etc di github.
  Togliamo ciò che non serve, ottimizziamo e riduciamo i tempi, introduciamo dove è necessario e può migliorare»;
  con l'occasione, aprire `docs/specs/` con il naming, la struttura e le caratteristiche delle specifiche di
  go-watchtower-pro.

## La v01

- Specifica: `SPEC-001-GitHubWorkflows-CLAUDE-v01.md`, SHA256
  `afdea8d22c4381e59025c41e5b26180baa8f8293c7caf32fc96abfa3ae65c2bd`.
- Fonti delle misure: i job e i passi dei run CI `44292674106` e `44282044685`, il log del Release Audit
  `44251649527`, le regole dei rami `develop` e `main` lette dalle API di GitHub, il conteggio locale dei file che il
  glob dell'artefatto trova con e senza i link simbolici.
- Stato: bozza, in attesa delle scelte D1–D6 e dell'approvazione del committente.

## Le scelte del committente (18 novembre 2026)

- Risposte: «D1: si togli, D2: sì, D3: init_monorepo_ci a cosa diavolo serve?!?!?, D4: ok, D5: zizmor a cosa
  serve?, D6: lascia stare il main per il momento».
- Claude ha spiegato D3 (tre comandi di avvio locale che nessuno richiama) e D5 (analizzatore di sicurezza dei
  workflow). D3 e D5 restano in attesa; `init_monorepo_ci.sh` non è stato toccato e zizmor non è stato aggiunto.

## La v02

- Specifica: `SPEC-001-GitHubWorkflows-CLAUDE-v02.md`, SHA256
  `2b88d0f8b2df7ca21cc4bf49c3fe3ed84039de837506148384e009878f4f8393`. Rispetto alla v01 cambiano solo lo stato, il §10
  con le risposte, la frase su `init_monorepo_ci.sh` (§5) e quella sulle regole dei rami (§9).

## Sviluppo

- Claude ha scritto lo sviluppo dopo le risposte, per D1, D2, D4 e D6.
- Scostamenti dalla v02, emersi nello sviluppo:
  - **Il pack non compila prima**: `pnpm pack` esegue il `prepack` di ogni package pubblicato (clean e build), come
    faceva già sopra l'artefatto scaricato. La build in più del job sarebbe stata buttata.
  - **actionlint** si richiama come `docker://rhysd/actionlint:1.7.12@sha256:…`, con il tag oltre al digest, così
    Renovate riconosce la versione e la aggiorna.
  - **ShellCheck** (dentro actionlint) segnalava SC2016 nel passo `Publish` di `release.yml`: il
    `${NODE_AUTH_TOKEN}` tra apici singoli è voluto, perché lo espande npm e il token non finisce su disco.
    Annotato con `# shellcheck disable=SC2016` e il motivo.
  - **Licenze**: `security.yml` osserva anche `bins/check-license-report.mjs`, che
    `docs/CHECK_LICENSE_REPORT.md` indicava come buco noto dei filtri.
  - Il commento di `release-audit.yml` citava un input `release_sha` che il workflow di rilascio non ha più: ora
    rimanda a `docs/RELEASING.md`.
- Prettier, lanciato su `.github`, ha riformattato anche `.github/ISSUE_TEMPLATE/config.yml` (file YAML che
  `format:check` non controlla): da rivedere nel diff.

## Verifica locale

- actionlint 1.7.12 (stesso digest della CI) su tutti i workflow: nessun rilievo.
- `pnpm build`, `pnpm test:bins` (5 suite, 0 falliti, compresi i test di `check:new-class-tests` e i 2 nuovi casi
  degli shard), `pnpm lint`, `pnpm format:check`, `pnpm knip`, `pnpm type-coverage` (99,93%), `pnpm dup:check`,
  `pnpm deps:check:bins`, `pnpm validate:scaffold`: tutti passano.
- `check:published-packages --print-node-matrix --shards 3`: 6 celle da 7 scenari ciascuna.
- Da fare con la PR: i tempi reali del primo run e il confronto con la stima del §7.

## D3 e D5 (18 novembre 2026)

- D3: «init_monorepo_ci.sh serve per far girare le CodeBuild su AWS per le Lambda!!! lascialo stare!!!». Errore di
  Claude: aveva cercato i riferimenti solo nel repository, mentre la buildspec sta su AWS. Il file resta.
- D5: «sì, aggiungi zizmor».

## La v03

- Specifica: `SPEC-001-GitHubWorkflows-CLAUDE-v03.md`, SHA256
  `07ca7312cd881f4a13b738e42bd4bd04d2ec2c024bc059bf4c37bd4a07e3821a`. Rispetto alla v02: stato approvato, D3 e D5
  decise, `init_monorepo_ci.sh` tolto dal §1.4 e confermato nel §5, zizmor nel §3.1 e nel §3.4, la sintassi `$/`
  nel §9.

## zizmor

- Prima esecuzione (zizmor 1.32.0, con i controlli online): 18 rilievi. Nessuna action vulnerabile né commit
  impostore.
  - **template-injection** (alto) in `setup-ci`: `pnpm install ${{ inputs.install-args }}` espandeva l'input nello
    script. Corretto: l'input passa da una variabile d'ambiente e si divide in argomenti con `read -ra`.
  - **dangerous-triggers** (alto) su `pull_request_target` di `Release Guards`: voluto, con il modello di fiducia
    già scritto in testa al file. Eccezione accanto alla riga.
  - **artipacked** su `release-audit.yml` e `release-guards.yml`: corretti con `persist-credentials: false`; il
    repository è pubblico, e il fetch della PR in `Release Guards` non chiede credenziali. Su `release.yml` è voluto
    (il job spinge i tag con il token dell'app): eccezione in `.github/zizmor.yml`.
  - **use-trusted-publishing** su `release.yml`: GitHub Packages non ha la pubblicazione con OIDC. Eccezione in
    `.github/zizmor.yml`.
  - **self-repository** (12 rilievi): la sintassi `uses: $/...` che GitHub accetta dal luglio 2026. actionlint
    1.7.12 la rifiuta (provato su un workflow di prova), quindi il controllo è spento in `.github/zizmor.yml`, con la
    nota di riattivarlo quando actionlint la accetterà.
- Dopo le correzioni: zizmor «No findings» (3 eccezioni, 6 rilievi a bassa confidenza nascosti dalla persona
  `regular`), actionlint senza rilievi, ShellCheck sul nuovo script di `setup-ci` pulito.
