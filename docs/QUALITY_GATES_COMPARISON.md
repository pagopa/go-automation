# Quality gate, linting e verifica dei repository GO

Data dell'analisi: **13 novembre 2026**.

Repository esaminati:

- `go-automation`
- `go-watchtower-pro`
- `go-runbooks`

## Scopo e limiti

Questo documento consolida il confronto svolto sulle configurazioni locali dei tre repository e le proposte di intervento. Distingue fra strumenti disponibili, controlli eseguiti dai workflow e requisiti effettivamente imposti al merge.

L'analisi ha incluso:

- Manifest, script dei package e configurazioni dei workspace.
- Configurazioni TypeScript, comprese le deroghe dei singoli progetti.
- Configurazioni effettive TypeScript ed ESLint su progetti rappresentativi.
- Workflow GitHub Actions e relativi comandi.
- Configurazioni di lint, formattazione, codice inutilizzato, duplicazione e architettura.
- Selettori dei test, soglie di coverage e alcuni controlli custom.
- Branch protection e regole effettive GitHub per i repository accessibili.

Il confronto iniziale non ha incluso le suite complete, scansioni delle vulnerabilità, build di distribuzione o operazioni di deploy. Le verifiche svolte per gli interventi successivi sono indicate nelle voci completate. La presenza di un gate non certifica che sia attualmente verde. Le configurazioni locali possono differire da quelle pubblicate sui branch remoti.

Le assenze indicate riguardano i file esaminati: eventuali impostazioni o servizi centralizzati dell'organizzazione vanno verificati prima di introdurre strumenti equivalenti.

Gli interventi senza spunta sono **proposte**; le voci completate riportano le modifiche applicate e le relative verifiche.

## Sintesi

- **go-automation** ha il controllo architetturale più articolato e il maggior numero di gate specializzati, ma presenta lacune di perimetro e coverage.
- **Watchtower** ha il lint più severo, controlli CSS specifici e una verifica infrastrutturale con cdk-nag; con WT-02/03/04 dispone anche di build Vite, coverage per modulo e regole architetturali nel check PR.
- **go-runbooks** ha controlli specifici sulla validità dei documenti, sul drift degli schemi e sul rendering compilato, ma meno controlli architetturali e sul tooling JavaScript.
- La priorità trasversale è l'enforcement: su GitHub, i branch verificati di **go-automation e go-runbooks non richiedono status check CI verdi**.

## Convenzioni di lettura

- **P0**: prima priorità, perché riguarda l'effettività dei gate o una lacuna concreta di perimetro.
- **P1**: intervento ad alto valore per consolidare verifiche e distribuzione.
- **P2**: intervento mirato o incrementale, da introdurre dopo il consolidamento.
- Le soglie di **test coverage** misurano il codice coperto durante i test; la **type coverage** misura la tipizzazione. Le due percentuali non sono confrontabili.
- Un comando fallito in CI non impedisce necessariamente il merge: deve anche essere richiesto dalle branch rules.

## Confronto sintetico

| Area                                 | go-automation                                        | Watchtower                                                  | go-runbooks                            |
| ------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| ESLint flat config type-aware        | `recommendedTypeChecked` e regole custom             | `strictTypeChecked`, `stylisticTypeChecked` e regole custom | `recommendedTypeChecked`               |
| Formatter                            | Prettier, anche dentro ESLint                        | Prettier separato dal lint                                  | Prettier, anche dentro ESLint          |
| Codice inutilizzato                  | Knip                                                 | Knip                                                        | Knip                                   |
| Duplicazione                         | jscpd, soglia 3%, con esclusioni                     | jscpd, fallimento sui duplicati rilevati                    | Non configurata                        |
| Architettura                         | dependency-cruiser e restrizioni ESLint              | dependency-cruiser, import-x e vincoli di piattaforma       | Nessun gate esplicito                  |
| Complessità                          | SonarJS parziale e limiti sui `main.ts` degli script | SonarJS e limiti dimensionali diffusi                       | Nessun controllo specifico             |
| Test runner                          | `node:test` con `tsx`                                | `node:test` su codice compilato                             | `node:test` con test `.mjs`            |
| Test coverage, righe/branch/funzioni | 90/80/90, su un sottoinsieme                         | Soglie 90–95% per modulo, dettagli in §2.7                  | 70/70/80                               |
| Type coverage                        | Soglia 99%                                           | Non configurata                                             | Non configurata                        |
| Audit dipendenze in CI               | High informativo, critical bloccante                 | Non configurato                                             | High e critical bloccanti              |
| Licenze                              | Checker custom                                       | Non configurate                                             | Non configurate                        |
| Controlli infrastrutturali dedicati  | Test e analisi statiche                              | cdk-nag e test di conformità                                | Non applicabile allo stesso livello    |
| Aggiornamenti dipendenze             | Renovate e Dependabot                                | Nessuna configurazione locale rilevata                      | Nessuna configurazione locale rilevata |

## Flag del compilatore

Tutti e tre i repository usano TypeScript 6 e hanno già una base rigorosa.

| Flag o configurazione                       | go-automation       | Watchtower                          | go-runbooks     |
| ------------------------------------------- | ------------------- | ----------------------------------- | --------------- |
| `strict` e relativa famiglia                | Attivi              | Attivi                              | Attivi          |
| `noUncheckedIndexedAccess`                  | Attivo              | Attivo                              | Attivo          |
| `noPropertyAccessFromIndexSignature`        | Attivo              | Attivo                              | Attivo          |
| `exactOptionalPropertyTypes`                | Attivo              | Attivo, salvo infra e relativi test | Attivo          |
| `noImplicitOverride`                        | Attivo              | Attivo                              | Attivo          |
| `noImplicitReturns`                         | Attivo              | Attivo                              | Attivo          |
| `noFallthroughCasesInSwitch`                | Attivo              | Attivo                              | Attivo          |
| `noUnusedLocals`, `noUnusedParameters`      | Attivi              | Attivi                              | Attivi          |
| `allowUnreachableCode`, `allowUnusedLabels` | `false`             | `false`                             | `false`         |
| `verbatimModuleSyntax`                      | Attivo              | Attivo                              | Attivo          |
| `noUncheckedSideEffectImports`              | Attivo              | Attivo                              | Attivo          |
| `isolatedDeclarations`                      | Attivo, con deroghe | Attivo, con deroghe                 | Attivo          |
| `erasableSyntaxOnly`                        | Non impostato       | Attivo                              | Non impostato   |
| `noEmitOnError`                             | Non esplicitato     | Attivo                              | Non esplicitato |
| `skipLibCheck`                              | `true`              | Base `false`, con deroghe a `true`  | `true`          |
| Sistema di moduli                           | NodeNext            | NodeNext; frontend Preserve/Bundler | NodeNext        |
| Target                                      | ES2025              | ES2025                              | ES2024          |
| Node usato dalla CI                         | 24                  | 26                                  | 25              |

Le deroghe non sono automaticamente difetti: per esempio, Watchtower documenta incompatibilità delle dichiarazioni CDK e necessità di inferenza di Drizzle e TanStack. Vanno mantenute circoscritte e motivate, non eliminate indiscriminatamente.

## Stato delle protezioni GitHub

Le API sono state interrogate sia per la branch protection classica sia per le regole effettive applicate ai branch.

| Repository    | Branch                        | Review richieste dalla protezione classica | Status check obbligatori |
| ------------- | ----------------------------- | ------------------------------------------ | ------------------------ |
| go-automation | `develop`, branch predefinito | 1                                          | Nessuno                  |
| go-automation | `main`                        | 1                                          | Nessuno                  |
| go-runbooks   | `main`, branch predefinito    | 3                                          | Nessuno                  |
| Watchtower    | Non verificabile              | Non verificabile                           | Non verificabile         |

Per le protezioni classiche lette, `enforce_admins` è `false`. Su `develop` di automation e su `main` di runbooks risultano anche regole contro cancellazione e aggiornamenti non fast-forward, oltre alla review automatica Copilot.

Il checkout Watchtower non ha un remote `origin`; le API per il repository atteso `pagopa/go-watchtower-pro` hanno restituito HTTP 404. Questo non permette di distinguere fra repository assente e permessi insufficienti.

La review automatica Copilot è complementare e non sostituisce build, test e lint obbligatori.

## 1. go-automation

### 1.1 Strumenti e controlli presenti

- **Compilazione**: TypeScript con project references; `build:ts` comprende anche controlli dedicati all'engine e ad alcuni tool in `bins/`.
- **Lint type-aware**: ESLint flat config, `typescript-eslint`, naming, uso di `any`, promise, readonly e assertion.
- **Regole custom**: struttura dei `main.ts`, export degli handler Lambda, divieto di input interattivo nelle Lambda, uso dei servizi condivisi e restrizioni sugli import del motore runbook.
- **Formattazione**: Prettier, sia come comando dedicato sia tramite integrazione ESLint.
- **Codice inutilizzato**: Knip con configurazione per workspace e alcune esclusioni.
- **Architettura**: dependency-cruiser con regole su cicli, risoluzione degli import, dipendenze verso test, layering e confini tra package, script, Lambda e tool.
- **Isolamento runbook**: regole su engine, toolkit, inventario e runtime; isolamento SEND/INTEROP, uso dell'SDK AWS e dipendenze dei package pubblicati.
- **Duplicazione**: jscpd con soglia 3%, minimo 50 token; esclusione di test, generated e inventario dei runbook.
- **Qualità del codice**: SonarJS, con diverse regole disabilitate; limiti aggiuntivi per i `main.ts` degli script.
- **Test**: `node:test` con `tsx`, distribuiti fra package, script, funzioni, infrastruttura e alcuni tool.
- **Test coverage**: soglie 90% righe, 80% branch e 90% funzioni per i workspace dotati del relativo script e inclusi nel comando CI.
- **Type coverage**: tool dedicato, soglia predefinita 99%; il perimetro comprende package, script, funzioni e bin, non `infra`.
- **Scaffold**: validatore custom su struttura, configurazioni, catalogo dipendenze e allineamento dei workspace.
- **Nuove classi**: controllo sulle nuove classi esportate dei package e sui relativi test, applicato su PR e merge group.
- **Compatibilità e drift**: test su baseline dei runbook e checksum degli artefatti di contratto generati.
- **Audit dipendenze**: job CI con soglia high informativa e critical bloccante.
- **Licenze**: `license-report` e checker custom, con policy ed eccezioni verificate.
- **Manutenzione**: Renovate per le dipendenze, Dependabot per GitHub Actions, `CODEOWNERS`, template PR e documentazione di contribuzione.
- **Diagnostica locale**: comando `doctor` della CLI per stato della build, discovery degli script e ambiente locale; non sostituisce i gate CI.

### 1.2 Pipeline e compilatore

La CI locale definisce 12 controlli principali:

1. Lint.
2. Format check.
3. Codice inutilizzato.
4. Grafo delle dipendenze.
5. Duplicazione.
6. Type coverage.
7. Scaffold.
8. Test per nuove classi.
9. Build.
10. Test.
11. Test coverage.
12. Smoke build macOS.

Il job aggregatore `CI Success` verifica che tutti abbiano successo. Il workflow gestisce anche `merge_group`. Audit e licenze sono in un workflow separato.

La configurazione del compilatore abilita i principali flag strict, `isolatedDeclarations` e i controlli sugli import. Alcuni tool e Lambda derogano a `isolatedDeclarations`.

Nonostante il base config escluda i test, alcuni progetti sostituiscono quell'esclusione: la configurazione effettiva di `go-common` e `go-runbook` include i rispettivi test TypeScript.

### 1.3 Limiti rilevati

- I risultati CI non sono richiesti dalle protezioni GitHub lette su `main` e `develop`.
- `deps:check`, eseguito dalla CI, non include `scripts/interop`. Anche la discovery usata per alcune regole di confine omette questa famiglia. Esiste `deps:check:full`, ma non è il comando del job.
- La coverage CI comprende `go-common` e due script con `test:coverage`, non l'intero monorepo. Il motore `go-runbook` non è protetto da quella soglia percentuale.
- Diverse regole `no-unsafe-*` e security sono warning; `eslint .` non impone `--max-warnings=0`.
- Le regole SonarJS di complessità cognitiva e di eccezioni ignorate sono disabilitate globalmente. I limiti di complessità espliciti riguardano i `main.ts` degli script.
- La build CI non esegue tutti i bundler delle Lambda: questi appartengono a `build:functions`.
- I test di deploy-environment hanno un comando dedicato, ma non fanno parte di `test:bins`.
- `validate:all` non comprende build, test e format; `quality` modifica i file. Non esiste un singolo comando locale non mutante equivalente all'intera CI.
- `CONTRIBUTING.md` prescrive `pnpm verify`, assente dal manifest esaminato.
- ESLint ignora JS, MJS e CJS, lasciando fuori alcuni tool del repository.
- Il format check non include YAML, YML, MJS e CJS.
- Le Actions sono quasi tutte fissate a SHA, ma il checkout del job licenze usa un tag mutabile.
- Il runtime dichiarato parte da Node 22, mentre la CI usa Node 24.

### 1.4 Interventi proposti

#### P0 — Enforcement e perimetro

- [ ] **AUTO-01 — Rendere obbligatorio `CI Success`** su `develop` e `main`; definire anche l'enforcement di audit e licenze senza introdurre check richiesti che non partono a causa dei filtri `paths`.
- [ ] **AUTO-02 — Includere INTEROP nel controllo architetturale**, sia nei comandi sia nella discovery delle regole. Verificare che un import vietato in uno script INTEROP faccia fallire il gate.

#### P1 — Consolidamento

- [ ] **AUTO-03 — Estendere la test coverage ai package critici**, iniziando da `go-runbook` e `go-aws`, con report e soglie per area basati su una baseline misurata.
- [ ] **AUTO-04 — Verificare gli artefatti distribuibili**, aggiungendo smoke build dei bundle Lambda oltre alla compilazione TypeScript.
- [ ] **AUTO-05 — Completare l'esecuzione dei test dei tool**, includendo nella pipeline i test di deploy-environment e gli altri comandi dedicati pertinenti.
- [ ] **AUTO-06 — Rendere bloccanti le regole type-safety selezionate**, promuovendo progressivamente i warning `no-unsafe-*` e gestendo il debito esistente con una baseline esplicita.
- [ ] **AUTO-07 — Definire la policy sui warning e sull'audit**, valutando l'allineamento alla soglia high bloccante di runbooks.
- [ ] **AUTO-08 — Introdurre un comando `check` non mutante**, allineato alla CI; tenere separati fix e formattazione in scrittura, correggendo il riferimento documentale a `pnpm verify`.
- [ ] **AUTO-09 — Estendere ESLint a JS/MJS/CJS**, usando override senza type checking dove non esiste un progetto TypeScript.
- [ ] **AUTO-10 — Estendere il format check** a YAML/YML/MJS/CJS e fissare a SHA l'Action rimasta su tag.
- [ ] **AUTO-11 — Verificare i package pubblicati con `publint` e Are the Types Wrong**, sugli artefatti impacchettati: exports, dichiarazioni e risoluzione dei sottopercorsi.

#### P2 — Verifiche mirate e manutenzione

- [ ] **AUTO-12 — Aggiungere test di tipo** per API pubbliche e generici critici, con `tsd` o fixture compilate.
- [ ] **AUTO-13 — Rivalutare le regole SonarJS disabilitate**, soprattutto eccezioni ignorate e complessità, senza riattivare indiscriminatamente regole incompatibili con le convenzioni.
- [ ] **AUTO-14 — Aggiungere actionlint e ShellCheck** per workflow e script shell.
- [ ] **AUTO-15 — Valutare CodeQL oppure Semgrep e secret scanning**, verificando prima i servizi organizzativi già attivi.
- [ ] **AUTO-16 — Allineare runtime, tipi e CI**: testare il minimo Node dichiarato oppure aggiornare il requisito; fissare la versione del package manager per migliorare la riproducibilità.
- [ ] **AUTO-17 — Esplicitare `noEmitOnError`**, valutare `erasableSyntaxOnly` e un controllo periodico con `skipLibCheck: false`, mantenendo le deroghe giustificate.
- [ ] **AUTO-18 — Aggiungere property-based test e mutation testing mirati**, per parsing, condizioni e finestre temporali, senza estenderli subito all'intero monorepo.
- [ ] **AUTO-19 — Controllare Markdown e link locali** della documentazione.

### 1.5 Fonti principali

- `package.json`, `pnpm-workspace.yaml`, `.npmrc`.
- `tsconfig.base.json`, `tsconfig.json`, `tsconfig.type-coverage.json` e configurazioni dei progetti.
- `eslint.config.mjs`, `.dependency-cruiser.cjs`, `.jscpd.json`, `knip.config.ts`.
- `.github/workflows/ci.yml`, `ci-job.yml`, `security.yml` e `.github/actions/setup-ci/action.yml`.
- `bins/validate-scaffold/src/`, `bins/check-new-class-tests/src/`, `bins/check-license-report.mjs`.
- `packages/go-runbook/src/__tests__/baseline.test.ts`.
- `packages/go-watchtower-client/src/__tests__/contractGeneration.test.ts`.
- `packages/go-cli/src/index.ts`, `CONTRIBUTING.md`, `CODEOWNERS`, `renovate.json`, `.github/dependabot.yml`.

## 2. go-watchtower-pro

### 2.1 Strumenti e controlli presenti

- **Compilazione**: TypeScript con project references per sorgenti e test.
- **Lint type-aware**: preset `strictTypeChecked` e `stylisticTypeChecked`, più regole custom.
- **Qualità del codice**: SonarJS, regole Unicorn, divieti specifici e limiti dimensionali.
- **Complessità**: regola di complessità cognitiva SonarJS con soglia 15.
- **Dimensioni**: massimo 300 righe di codice per file di classi/type/componenti e 400 per file di funzioni; commenti e righe vuote non contano.
- **Cicli**: `eslint-plugin-import-x` con `no-cycle`.
- **Architettura**: dependency-cruiser su sorgenti e test, con risoluzione degli alias workspace sui sorgenti, confini tra package e livelli, e test positivi/negativi del gate.
- **React**: ESLint React Hooks e React Compiler nella configurazione Vite.
- **Regole custom**: tipi nominati, composizione al posto dell'ereditarietà non di piattaforma, vincoli sul design system e confronto sicuro dei nodi DOM nei test.
- **Disciplina del lint**: errore per direttive disable inutilizzate e obbligo di motivazione dei disable.
- **CSS**: Stylelint con regole specifiche sui design token, sulle famiglie di variabili e sui valori invalidi.
- **Formattazione**: Prettier separato da ESLint, con controllo esteso al repository salvo esclusioni.
- **Codice inutilizzato**: Knip su sorgenti e test.
- **Duplicazione**: jscpd su TypeScript/TSX; fallimento sui duplicati rilevati, senza esclusione generale dei test.
- **Test**: `node:test` su codice compilato, con gruppi e sharding controllati.
- **Coverage**: c8 aggrega i dati V8 dei processi esistenti, include i file mai importati e applica soglie indipendenti a backend, frontend, shared e client; LCOV e riepiloghi JSON conservati come artifact CI per 14 giorni.
- **Frontend test**: Testing Library e happy-dom.
- **Backend test**: integrazione PostgreSQL e test di contratto del client.
- **Infrastruttura**: test CDK, cdk-nag e validazioni che bloccano synthesis/deploy in presenza di violazioni non riconosciute.
- **Dipendenze**: catalogo pnpm centralizzato, package manager fissato e policy esplicita sugli script di installazione ammessi.

### 2.2 Pipeline e compilatore

Il workflow `release.yml` esegue `pnpm check` sulle PR e sui push a `main`.

Il comando aggrega:

1. Build TypeScript.
2. Build di produzione del frontend con Vite e React Compiler, aggiunta con WT-02.
3. Test del gate architetturale e dependency-cruiser.
4. Test, con avvio dei servizi locali necessari, raccolta coverage e verifica delle soglie per modulo.
5. ESLint.
6. Stylelint.
7. Prettier.
8. Knip.
9. jscpd.

Il job conserva i report LCOV e JSON già prodotti anche in caso di fallimento; l'upload dell'artifact è configurato nel workflow, non eseguito dalla verifica locale.

Sul push, il rilascio test dipende dal check; il rilascio prod dipende da quello test. Il workflow usa l'environment GitHub `prod`, ma le relative impostazioni remote di approvazione non sono state verificabili.

Il base config abilita `noEmitOnError`, `erasableSyntaxOnly` e `skipLibCheck: false`. Le deroghe effettive comprendono:

- `isolatedDeclarations: false` per frontend/backend e relativi progetti di test.
- `skipLibCheck: true` per diversi progetti, per incompatibilità delle dichiarazioni delle dipendenze.
- `exactOptionalPropertyTypes: false` per infra e relativi test.
- `module: Preserve` e `moduleResolution: Bundler` per il frontend.

I vincoli di piattaforma limitano le API disponibili: shared non riceve automaticamente i tipi Node/DOM, mentre il frontend usa i tipi browser. WT-04 affianca a questi vincoli il controllo del grafo architetturale, senza modificare le deroghe del compilatore.

### 2.3 Limiti rilevati

- L'enforcement remoto dei check non è verificabile con gli accessi disponibili.
- Alla prima analisi mancavano raccolta e soglie automatiche di test coverage. Limite risolto con WT-03 per i quattro moduli richiesti; functions e infra restano fuori dalle soglie.
- Alla prima analisi mancavano regole esplicite sul grafo delle dipendenze tra package e livelli delle feature. Limite risolto con WT-04, preservando il riuso legittimo fra feature.
- Alla prima analisi, `pnpm check` non comprendeva `build:site`: Vite e React Compiler venivano eseguiti nella preparazione del deploy, non nel check PR. Limite risolto con WT-02.
- `pnpm audit` è richiesto dalle istruzioni di lavoro, ma non è incluso nel comando aggregato o nel workflow.
- Le GitHub Actions preesistenti sono referenziate con tag mutabili `@v4`; la nuova action di upload coverage usa uno SHA.
- Non sono state rilevate configurazioni locali di aggiornamento automatico delle dipendenze o di controllo delle licenze.
- Non sono stati rilevati gate browser E2E, accessibilità automatica o budget del bundle.

### 2.4 Interventi proposti

#### P0 — Enforcement

- [ ] **WT-01 — Verificare remote e branch rules**, rendendo obbligatorio il job `check` prima del merge. Verificare separatamente le approvazioni dell'environment prod.

#### P1 — Consolidamento

- [x] **WT-02 — Aggiungere `build:site` al check PR**, verificando la build Vite e React Compiler prima del deploy, senza credenziali AWS. Implementato il 13 novembre 2026 in `go-watchtower-pro/package.json`: `pnpm check` esegue `pnpm --filter=@watchtower/frontend build:site` dopo la compilazione TypeScript e prima dei test. Il workflow PR usa già questo comando, quindi un errore della build interrompe il check senza modificare infrastruttura o deploy. Verifica: `pnpm check` superato con le credenziali AWS d'ambiente rimosse e i file AWS di configurazione e credenziali impostati a `/dev/null`; 4.395 test superati, lint, stili, formato, Knip e jscpd superati. Verificata la generazione di `apps/frontend/dist/site/index.html`.
- [x] **WT-03 — Introdurre test coverage**, con report LCOV e soglie progressive per backend, frontend, shared e client; definire esplicitamente le esclusioni. Implementato con c8, soglie indipendenti 90–95%, aggregazione degli shard senza ripetere i test e artifact CI. Configurazione, baseline ed evidenze in §2.7.
- [x] **WT-04 — Aggiungere dependency-cruiser**, con regole per confini fra package, piattaforme e feature; preservare le eccezioni legittime dei test di contratto. Implementato su sorgenti e test, inclusi gli import di soli tipi; test di regressione verificano alias, eccezioni e rifiuto delle violazioni. Evidenze in §2.7.
- [ ] **WT-05 — Automatizzare l'audit delle dipendenze**, sulle PR pertinenti e con esecuzione schedulata, definendo la soglia bloccante.
- [ ] **WT-06 — Fissare le GitHub Actions a SHA**, mantenendo un commento con la versione leggibile.
- [ ] **WT-07 — Configurare Renovate o Dependabot**, solo dopo aver verificato eventuali automazioni organizzative già attive.
- [ ] **WT-08 — Aggiungere un controllo delle licenze**, adottando una policy approvata e un processo esplicito per le eccezioni.
- [ ] **WT-09 — Aggiungere actionlint e ShellCheck**, coprendo workflow e script di test/rilascio.

#### P2 — Protezione funzionale e distribuzione

- [ ] **WT-10 — Introdurre Playwright sui flussi critici**, integrando axe-core per accessibilità automatica. I test browser completano quelli happy-dom, non li sostituiscono.
- [ ] **WT-11 — Definire un budget del bundle frontend**, per esempio con size-limit, basato sulla build di produzione.
- [ ] **WT-12 — Scansionare le immagini container con Trivy**, prima della pubblicazione o del rilascio, con policy su severità ed eccezioni.
- [ ] **WT-13 — Valutare CodeQL oppure Semgrep e secret scanning**, senza duplicare controlli aziendali già disponibili.
- [ ] **WT-14 — Aggiungere test di tipo per shared/client**, limitati a contratti e generici che meritano una protezione esplicita.
- [ ] **WT-15 — Aggiungere CODEOWNERS e template PR**, con responsabilità e prove di validazione richieste.
- [ ] **WT-16 — Controllare Markdown e link locali** della documentazione.
- [ ] **WT-17 — Verificare periodicamente le deroghe TypeScript**, mantenendo quelle necessarie per CDK, Drizzle e TanStack; non disabilitare globalmente ulteriori controlli per risolvere incompatibilità locali.

### 2.5 Controlli da mantenere, non da aggiungere

- ESLint strict type-aware.
- SonarJS, Unicorn e controllo dei cicli.
- Knip e jscpd.
- React Hooks lint.
- Stylelint e regole sui design token.
- cdk-nag e test che verificano il blocco della synthesis.
- Comando aggregato `pnpm check`.

Non è necessario sostituire questi strumenti per ottenere i miglioramenti proposti.

### 2.6 Fonti principali

- `package.json`, `pnpm-workspace.yaml`, `AGENTS.md`.
- `tsconfig.base.json`, `tsconfig.json` e configurazioni di app, package e test.
- `eslint.config.js`, `stylelint.config.js`, `.jscpd.json`, `knip.json`.
- `.c8rc.json`, `dependencyCruiser.config.js`, `tsconfig.dependencies.json`, `bins/dependencies.test.js`.
- `.github/workflows/release.yml`, `bins/test.sh`, `bins/aws.sh`.
- `apps/frontend/package.json`, `apps/frontend/vite.config.js`.
- `infra/src/app/checkCompliance.ts`.
- `infra/test/app/checkCompliance.test.ts`, `infra/test/fixtures/testStacks.ts`.
- `apps/backend/test/contract/watchtowerClient.test.ts`.

### 2.7 WT-03 e WT-04: implementazione e verifiche

Implementati il **13 novembre 2026** in `go-watchtower-pro`. I controlli entrano nel `pnpm check` già eseguito dal job PR; non cambiano deploy, infrastruttura o codice applicativo.

**Coverage.** `pnpm test:coverage` avvia i servizi locali, esegue una sola volta `bins/test.sh` sotto c8 e verifica le quattro soglie. Restano invariati isolamento, quattro shard frontend e concorrenza backend. `pnpm check:coverage` rilegge gli stessi dati senza ripetere i test. La misurazione comprende anche i file compilati mai importati, rimappati sui sorgenti TypeScript tramite source map.

Nella tabella, ogni cella indica **coverage misurata / soglia minima**:

| Modulo   | Righe        | Statement    | Funzioni     | Branch       |
| -------- | ------------ | ------------ | ------------ | ------------ |
| Backend  | 97,02% / 95% | 97,02% / 95% | 96,33% / 95% | 96,23% / 95% |
| Frontend | 96,64% / 95% | 96,64% / 95% | 93,42% / 90% | 96,41% / 95% |
| Shared   | 97,26% / 95% | 97,26% / 95% | 93,22% / 90% | 94,43% / 90% |
| Client   | 93,90% / 90% | 93,90% / 90% | 99,19% / 95% | 96,35% / 95% |

Le soglie sono iniziali e basate sulla suite completa: avanzamento esplicito di 5 punti nelle modifiche che consentono il gradino successivo, fino ad almeno 95% per tutte le metriche. La policy in `AGENTS.md` vieta di abbassarle o ampliare le esclusioni per aggirarle; l'avanzamento non è automatico.

Esclusioni esplicite in `.c8rc.json`: test e fixture nelle directory `test/` e `dist-test/`, dichiarazioni `.d.ts`, bundle Vite e soli entry point con avvio immediato (`app/main` frontend; `app/cli/createUser`, `app/migrate/migrate`, `app/server/server`, `app/worker/worker` backend). Factory, composizione e logica riutilizzabile restano misurate. Functions e infra restano nel runner, ma fuori dalle quattro soglie richieste.

Report: `coverage/lcov.info`, `coverage/coverage-summary.json` e gli equivalenti in `coverage/{backend,frontend,shared,client}/`. Il workflow conserva questi soli report nell'artifact `coverage` per 14 giorni; i dati V8 grezzi restano locali e non vengono caricati.

**Architettura.** `pnpm check:dependencies` esegue tre test di regressione e analizza sorgenti e test con dependency-cruiser. Il `tsconfig.dependencies.json`, escluso dalle project references di build, risolve gli alias su `src/` anziché sugli export compilati. Il gate blocca import irrisolti, cicli interamente runtime, dipendenze dai test e violazioni dei confini fra shared, client e applicazioni.

Platform e design system non importano feature locali; le feature non importano la composizione. Sono verificati anche i livelli API/componenti/pagine frontend e API/domain/data backend. Sono ammessi import di soli tipi nei confini dichiarati, etichette pure `.ts`, riuso di contratti, schemi e tabelle fra feature, e il costruttore generico `lists/domain/ItemModel.ts` dal livello data. Solo `apps/backend/test/contract/` può importare il client dal backend; questi test sono analizzati normalmente, non ignorati. I cicli interrotti da import di soli tipi non sono trattati come cicli runtime.

**Evidenze locali:**

- `pnpm check`: **superato**, con credenziali AWS d'ambiente rimosse e file AWS impostati a `/dev/null`. Build TypeScript e Vite/React Compiler, 4.395 test applicativi/infrastrutturali, 3 test del gate architetturale, coverage per modulo, ESLint, Stylelint, Prettier, Knip e jscpd superati.
- `pnpm check:dependencies`: **superato**, 2.365 moduli e 15.190 dipendenze analizzati, zero violazioni. I test su workspace temporanei verificano che import vietati e cicli runtime producano un'uscita non zero, e che alias sui sorgenti e test di contratto restino validi.
- `pnpm exec c8 report --include='apps/backend/**' --reports-dir=coverage/backend --check-coverage --lines=100 --statements=95 --functions=95 --branches=95`: **fallimento atteso**, exit 1 perché 97,02% delle righe è inferiore al 100%; verificato il blocco effettivo delle soglie.
- `pnpm audit`: **non superato**, una vulnerabilità moderate preesistente di `minimatch` (`GHSA-g3hv-75wg-m249`, versione 10.2.6 già presente nel lockfile iniziale). L'advisory introdotto tramite c8/glob è stato eliminato con l'override mirato `test-exclude>glob: ^14.0.2`, senza aggiungere deroghe alla release age. L'automazione dell'audit resta WT-05, non implementato in questo intervento.

L'upload artifact e l'enforcement remoto restano da verificare su GitHub; la verifica locale non li certifica.

## 3. go-runbooks

### 3.1 Strumenti e controlli presenti

- **Compilazione**: TypeScript con build e type-check separati.
- **Lint type-aware**: ESLint flat config e preset `recommendedTypeChecked`.
- **Regole del codice**: naming, `any`, promise, readonly, assertion e alcune euristiche security.
- **Formattazione**: Prettier, anche integrato in ESLint.
- **Codice inutilizzato**: Knip.
- **Test**: `node:test` con test `.mjs` e caricamento dei sorgenti TypeScript tramite `tsx`.
- **Test funzionali**: CLI, validazione, parsing dei blocchi, rendering e interazioni Confluence simulate.
- **Coverage**: soglie 70% righe, 70% branch e 80% funzioni; report LCOV.
- **Validazione dei contenuti**: schemi Zod/Ajv, riferimenti ai template, contratti dei blocchi, variabili riservate, defaults e include.
- **Drift degli schemi**: rigenerazione e confronto con gli schemi JSON versionati.
- **Smoke test**: rendering di tutti i runbook Markdown con la CLI compilata, più caricamento degli artefatti CI.
- **Audit dipendenze**: job separati high e critical, entrambi bloccanti nel rispettivo workflow.
- **Verifica read-only**: comando `verify` per confrontare la pagina Confluence live con il risultato atteso, con exit code distinti per uguaglianza, differenza e impossibilità della verifica.
- **Preflight di sync**: validate, build e render prima della pubblicazione.

### 3.2 Pipeline e compilatore

La CI PR definisce dieci job:

1. Validate runbooks.
2. Type-check.
3. Lint.
4. Format check.
5. Knip.
6. Build.
7. Test.
8. Coverage.
9. Schema check.
10. Render smoke test.

Il workflow di sicurezza è separato e schedulato. La sync su `main` ha un proprio preflight, più ristretto della CI PR.

Il compilatore abilita i principali flag strict, `isolatedDeclarations` e i controlli sugli import. Include `src/**/*.ts`, non i test JavaScript. `skipLibCheck` è attivo; `noEmitOnError` ed `erasableSyntaxOnly` non sono esplicitati.

### 3.3 Limiti rilevati

- I risultati CI non sono richiesti dalla protezione GitHub letta su `main`.
- Test e script MJS sono esclusi da ESLint. I test non rientrano neanche nel type-check dei sorgenti.
- Non esistono gate espliciti su cicli, layering, duplicazione o complessità.
- Diverse regole type-safety/security sono warning non bloccanti.
- Il format check comprende TS, JS, JSON e Markdown, ma non YAML/YML/MJS.
- La validazione semantica dei runbook YAML esiste già; il limite precedente riguarda la formattazione, non l'assenza di validazione.
- Il preflight della sync non richiede l'intera suite CI sullo stesso commit.
- Mancano un comando locale aggregato non mutante e un job CI riassuntivo.
- Il job audit high intercetta già anche i critical, rendendo ridondante il secondo audit.
- Non sono state rilevate configurazioni locali di aggiornamento automatico delle dipendenze o controllo licenze.
- La CI usa Node 25, mentre le dichiarazioni `@types/node` appartengono alla famiglia 26.

### 3.4 Interventi proposti

#### P0 — Enforcement

- [ ] **RB-01 — Aggiungere un job CI aggregatore e renderlo obbligatorio** su `main`, includendo una strategia corretta per il workflow security con filtri `paths`.

#### P1 — Consolidamento

- [ ] **RB-02 — Collegare la sync all'intero check dello stesso commit**, non al solo preflight validate/build/render.
- [ ] **RB-03 — Aggiungere un comando `check` non mutante**, che riproduca i controlli necessari prima della PR.
- [ ] **RB-04 — Estendere ESLint a test e script MJS**, usando regole non type-aware dove necessario, senza imporre una migrazione dei test.
- [ ] **RB-05 — Promuovere progressivamente i warning type-safety selezionati a errori**, con gestione esplicita del debito esistente.
- [ ] **RB-06 — Aggiungere dependency-cruiser con poche regole mirate**, per cicli e separazione fra schema/dominio, renderer, CLI e adattatore Confluence.
- [ ] **RB-07 — Aggiungere SonarJS**, iniziando da complessità, ridondanze e pattern problematici, senza adottare indiscriminatamente tutte le opinioni stilistiche.
- [ ] **RB-08 — Aggiungere jscpd sul codice del motore**, escludendo inizialmente testi e template dove la ripetizione può essere intenzionale.
- [ ] **RB-09 — Estendere il format check a YAML/YML/MJS** e aggiungere actionlint per i workflow.
- [ ] **RB-10 — Consolidare gli audit in un gate high**, mantenendo esecuzione schedulata e report utili.
- [ ] **RB-11 — Introdurre golden test rappresentativi dei renderer**, per rilevare regressioni dell'output, non soltanto errori di esecuzione del rendering.

#### P2 — Contenuti, contratti e manutenzione

- [ ] **RB-12 — Automatizzare il drift check Confluence con `verify`**, preferibilmente schedulato, in sola lettura e con gestione esplicita delle credenziali e degli errori.
- [ ] **RB-13 — Aggiungere property-based test**, per merge di variabili, normalizzazione, parsing e contratti dei blocchi; valutare mutation testing solo sui moduli più critici.
- [ ] **RB-14 — Configurare Renovate o Dependabot e un controllo licenze**, verificando prima le policy organizzative.
- [ ] **RB-15 — Valutare CodeQL oppure Semgrep e secret scanning**, senza duplicare servizi esistenti.
- [ ] **RB-16 — Aggiungere CODEOWNERS e template PR**, con checklist per schemi, validazione e rendering.
- [ ] **RB-17 — Controllare Markdown e link locali**, distinguendo i documenti sorgente dagli output generati.
- [ ] **RB-18 — Allineare Node, `@types/node` e CI**; esplicitare `noEmitOnError`, valutare `erasableSyntaxOnly` e controlli periodici con `skipLibCheck: false`.

### 3.5 Fonti principali

- `package.json`, `tsconfig.json`, `eslint.config.mjs`, `knip.jsonc`.
- `.prettierrc.json`, `.prettierignore`.
- `.github/workflows/ci.yml`, `ci-job.yml`, `security.yml`, `sync-confluence.yml`.
- `src/commands/validate.ts`, `src/commands/verify.ts`.
- `tests/unit/cli.test.mjs`, `tests/unit/workflow-steps.test.mjs` e gli altri test unitari.
- `README.md`.

## 4. Criteri di adozione

### Ordine consigliato

1. Rendere obbligatori i gate esistenti e verificare quelli non accessibili.
2. Chiudere le lacune di perimetro: INTEROP, bundle Lambda, build Vite, test dei tool e lint MJS.
3. Rendere riproducibile il check locale e allineare documentazione e CI.
4. Introdurre coverage e regole architetturali dove mancano.
5. Aggiungere verifiche specializzate: browser, accessibilità, renderer e package pubblicati.
6. Attivare analisi più costose o sperimentali solo su aree critiche o con schedulazione.

### Come misurare il risultato

- Un gate obbligatorio fallito deve impedire il merge nei casi coperti dalle branch rules.
- Ogni nuova regola architetturale deve essere verificata anche con un esempio negativo controllato.
- Le soglie di coverage devono dichiarare perimetro ed esclusioni; non basta pubblicare una percentuale.
- Le build smoke devono verificare l'artefatto effettivamente distribuito, non soltanto il type-check.
- I nuovi controlli devono produrre errori azionabili, con file e motivo del fallimento.
- Le eccezioni devono avere una motivazione e un perimetro ristretto.
- Nessun tool deve inviare codice a servizi esterni senza una verifica preventiva delle policy e un'autorizzazione appropriata.

### Cosa non introdurre per default

- Non migrare a Biome soltanto per uniformare i repository: il lint type-aware esistente è già adeguato.
- Non sostituire il test runner senza una necessità concreta.
- Non aggiungere un secondo detector dei cicli ad automation.
- Non introdurre automaticamente Nx o Turborepo: prima misurare eventuali colli di bottiglia.
- Non imporre a tutti i repository le stesse soglie o gli stessi tool: frontend, librerie pubblicate e motore documentale hanno rischi diversi.
- Non considerare hook locali o checklist documentali sostituti della CI e delle branch rules.

L'obiettivo è aumentare la protezione effettiva del codice e degli artefatti distribuiti, non il numero di dipendenze di sviluppo.
