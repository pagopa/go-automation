# Controlli dei package pubblicati

> Guida ai comandi introdotti dalla Fase 4 di [EVO-PKGPUB-OPUS-01](evolutions/EVO-PKGPUB-OPUS-01.md) (§10): cosa fa ogni comando, quando usarlo e come.
>
> Data: 2026-11-16.
>
> Per le versioni, le changeset e i rilasci: [RELEASING.md](RELEASING.md).

## 1. A cosa servono

Tre package del monorepo vengono pubblicati su GitHub Packages e installati da altri repository: `@pagopa/go-common`, `@pagopa/go-aws` e `@pagopa/go-runbook`. Il primo che li userà è la Lambda di go-watchtower.

Dentro il monorepo tutto funziona "per comodità":

- i package si vedono tra loro direttamente, senza passare da un'installazione;
- se un package usa una libreria senza dichiararla, spesso funziona lo stesso, perché un altro package l'ha già installata;
- usiamo una sola versione di Node.

Fuori dal monorepo queste comodità spariscono. Una versione pubblicata, inoltre, **non si può più correggere**: si può solo pubblicarne una nuova. Un errore lo scopre chi installa il package, magari in produzione.

I controlli di questa guida si mettono **nei panni di chi installa** e verificano, prima di pubblicare, che i package funzionino davvero. Ogni controllo risponde a una domanda:

| Domanda                                                            | Comando                         |
| ------------------------------------------------------------------ | ------------------------------- |
| Il `package.json` di ogni package è scritto bene?                  | `pnpm publint:published`        |
| TypeScript trova i tipi di ogni import, come li vede chi installa? | `pnpm attw:published`           |
| Abbiamo cambiato l'API pubblica?                                   | `pnpm api:report`               |
| Caricare un entrypoint costa troppo, o carica librerie sbagliate?  | `pnpm check:import-cost`        |
| Nei pacchetti finiscono account id AWS o nomi di profilo?          | `pnpm check:published`          |
| Il pacchetto vero, installato da zero, funziona?                   | `pnpm check:published-packages` |

`pnpm test:published` li esegue tutti.

## 2. Quale comando usare, caso per caso

| Situazione                                                                   | Cosa fare                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Lavoro di tutti i giorni                                                     | Niente: la CI esegue tutto a ogni PR.                                                                               |
| Ho cambiato cosa esporta un package (aggiunto, tolto o modificato un export) | `pnpm build`, poi `pnpm api:report:update`; controlla il diff dei file in `api/` e committali con il codice (§4.3). |
| La CI è rossa sul job "Published Packages"                                   | Guarda quale passo è fallito e leggi la sezione di quel comando (§4).                                               |
| Ho aggiunto un sottopercorso a un package pubblicato                         | Aggiungilo agli `exports`, poi aggiorna scenari, budget e report (§5.1).                                            |
| Ho aggiornato una dipendenza (catalog)                                       | `pnpm check:published-packages`: verifica anche che la versione minima di Node resti valida (§4.6).                 |
| Ho aggiunto un import in un file di go-runbook o go-aws                      | `pnpm check:import-cost`: verifica che l'entrypoint non carichi librerie vietate (§4.4).                            |
| Sto per pubblicare una versione                                              | `pnpm test:published` (circa 3,5 minuti), oltre alla CI verde.                                                      |
| Voglio capire perché uno scenario fallisce                                   | `pnpm check:published-packages --scenario <id> --keep` e guarda il progetto di prova (§4.6).                        |

## 3. Prima di iniziare

Quasi tutti i comandi leggono i file **compilati** (`dist/`) dei package. Prima di lanciarli in locale:

```bash
pnpm build
```

Fa eccezione `pnpm check:published-packages`: crea da solo i pacchetti con `pnpm pack`, che compila il package prima di impacchettarlo.

## 4. I comandi

### 4.1 `pnpm publint:published`: il `package.json` è scritto bene?

**Cosa fa.** Esegue [publint](https://publint.dev) sui tre package. Controlla che ogni voce di `exports` punti a un file che esiste nel pacchetto, che i campi `types`, `import` e `default` siano nell'ordine giusto e che `files` includa tutto il necessario.

**A cosa serve.** Evita l'errore "Cannot find module" per chi installa.

**Quando usarlo.** Quando modifichi `exports`, `files` o `main` di un package pubblicato.

**Se fallisce.** publint indica il campo sbagliato e il motivo. Correggi il `package.json` del package.

### 4.2 `pnpm attw:published`: i tipi si trovano?

**Cosa fa.** Esegue [Are The Types Wrong](https://github.com/arethetypeswrong/arethetypeswrong.github.io) (`attw`) sul pacchetto di ogni package, con il profilo `esm-only`. Simula le diverse risoluzioni di TypeScript e controlla che ogni sottopercorso abbia i suoi tipi.

**A cosa serve.** Evita che chi installa veda il codice ma non i tipi, oppure tipi sbagliati.

**Quando usarlo.** Insieme a publint, quando cambi `exports`.

**Da sapere.** Nell'output compaiono avvisi `(ignored per resolution)` per CommonJS: sono attesi, perché i package sono solo ESM e chi usa CommonJS deve usare `import()` dinamico. Il comando fallisce solo per problemi reali.

### 4.3 `pnpm api:report` e `pnpm api:report:update`: abbiamo cambiato l'API?

**Cosa fa.** Per ogni sottopercorso pubblicato, scrive una "fotografia" di cosa esporta in `packages/<package>/api/<sottopercorso>.api.md`. Per esempio, `packages/go-aws/api/s3.api.md` è la fotografia di `@pagopa/go-aws/s3`. Ogni fotografia contiene:

- ogni export, in ordine alfabetico, con la sua dichiarazione così come la vede chi installa (senza commenti);
- per ogni export, se è un **valore** (`(value)`: una classe, una funzione, una costante) o **solo un tipo** (`(type)`). Lo decide il compilatore stesso;
- i namespace, come `apigw` in `toolkits/send`, espansi con il loro contenuto;
- la sezione **"Referenced but not exported"**: tipi del package usati da un export ma che nessun sottopercorso esporta, con la loro forma.

I due comandi:

- `pnpm api:report` **controlla**: rigenera le fotografie in memoria e fallisce se una è diversa da quella nel repository, se manca o se non corrisponde più a un sottopercorso;
- `pnpm api:report:update` **riscrive** le fotografie.

**A cosa serve.**

- **Ti accorgi di ogni cambio dell'API pubblica.** Un cambio che sembra interno (rinominare un tipo, rendere facoltativa una proprietà, passare da `export` a `export type`) può rompere chi installa. Con la fotografia il cambio diventa visibile nel diff della PR.
- **Scegli la versione giusta.** Togliere o rinominare un export, o cambiare un campo di un'interfaccia pubblica, è un cambio **major** (§9.2 della SPEC). La fotografia ti dice quando succede.
- **Vedi i tipi "orfani".** Chi installa vede quei tipi, ma non può importarli per usarli nel proprio codice. Vanno esportati o resi interni prima della `1.0.0`. Oggi la sezione è solo informativa e non fa fallire il controllo.

**Quando usarlo.** Ogni volta che cambi cosa esporta un package pubblicato. In CI fallisce se ti dimentichi.

**Come.**

```bash
pnpm build                 # le fotografie si generano dai file compilati
pnpm api:report:update     # riscrive i file in packages/*/api/
git diff packages/*/api/   # controlla che il cambio sia quello voluto
```

Poi committa i file `api/` insieme al codice.

**Se fallisce in CI.** Il messaggio elenca i file cambiati, per esempio `packages/go-runbook/api/toolkits-send.api.md (changed)`. Se il cambio è voluto, esegui i passi qui sopra. Se non lo è, hai cambiato l'API per sbaglio: correggi il codice.

**Da sapere.** I file in `api/` non si modificano a mano, non finiscono nel pacchetto pubblicato e Prettier li ignora.

### 4.4 `pnpm check:import-cost`: quanto costa caricare un entrypoint?

**Cosa fa.** Per 18 entrypoint (o coppie di entrypoint) controlla due cose:

1. **Quali librerie carica.** Costruisce con esbuild il grafo dei moduli che l'import carica e lo confronta con le regole. Per esempio, `@pagopa/go-runbook` non deve caricare né gli SDK AWS né `undici`, e `@pagopa/go-aws/s3` deve caricare solo `client-s3` e `client-sts`. Questo controllo è deterministico ed è la garanzia vera.
2. **Quanto tempo ci mette.** Importa l'entrypoint in un processo Node nuovo 5 volte e prende la mediana. Questa soglia è larga, perché il tempo dipende dalla macchina.

Esempio di output:

```text
ok   @pagopa/go-runbook: 43 ms (budget 60), 4 third-party packages
ok   @pagopa/go-aws/s3: 50 ms (budget 80), 23 third-party packages
18/18 budgets met on Node 26.12.1.
```

**A cosa serve.** Nella Lambda il tempo di avvio conta. Basta un import pesante nel posto sbagliato per far caricare tutto l'SDK AWS a chi voleva solo l'engine. Il controllo lo blocca.

**Quando usarlo.** Quando aggiungi o sposti import nei package pubblicati, soprattutto in go-runbook.

**Se fallisce.**

- **Per una libreria vietata:** il messaggio dice quale libreria è stata caricata. Cerca quale file la importa e spostalo nell'entrypoint giusto (per esempio in `./runtime`, l'unico di go-runbook che può usare gli SDK).
- **Per il tempo:** su una macchina lenta, puoi allargare solo le soglie di tempo con una variabile d'ambiente. Le regole sulle librerie restano uguali.

  ```bash
  IMPORT_COST_TIME_FACTOR=2 pnpm check:import-cost
  ```

  In CI (job Published Packages e workflow Release) il fattore è già impostato a `2`, perché le macchine di GitHub sono circa due volte più lente di un computer di sviluppo.

- **Per cambiare un budget** (una nuova soglia o un nuovo entrypoint): modifica `bins/check-import-cost/src/budgets.ts`. I valori vengono dalla SPEC (§10.4): un cambio va motivato.

### 4.5 `pnpm check:published`: nessun dato sensibile nei pacchetti

Questo comando c'era già (EVO-AWSACCT-OPUS-01). Crea il pacchetto di ogni `@pagopa/*` e controlla che nessun file contenga account id AWS, ARN con account o nomi di profilo. È spiegato in [AWS_LOGICAL_ACCOUNTS.md](AWS_LOGICAL_ACCOUNTS.md). Ora fa parte anche di `test:published`.

### 4.6 `pnpm check:published-packages`: il pacchetto vero funziona?

È il controllo più importante.

**Cosa fa.** Per ogni package pubblicato:

1. crea il pacchetto vero, cioè il `.tgz` che verrebbe pubblicato, con `pnpm pack`;
2. per ogni **scenario** (vedi tabella), crea un progetto vuoto in una cartella temporanea e ci installa i pacchetti;
3. in ogni progetto verifica che:
   - ogni sottopercorso dello scenario si importi in un processo Node nuovo;
   - TypeScript compili un file che usa quei sottopercorsi, con `skipLibCheck: false` e le impostazioni più severe (`NodeNext`, `exactOptionalPropertyTypes`);
   - la versione di Node promessa da ogni package (`engines.node`) sia compatibile con tutte le dipendenze che quel package installa davvero.

Gli scenari:

| Scenario | Cosa installa                                                 | Cosa verifica                                                                                                                                          |
| -------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `S1`     | go-common                                                     | tutti i sottopercorsi di go-common                                                                                                                     |
| `S4-*`   | go-aws con **solo** i peer SDK di un sottopercorso            | un sottopercorso alla volta, per esempio `S4-s3` con solo `client-s3`: chi usa un servizio installa solo quel client                                   |
| `S6`     | go-runbook **senza** nessun SDK AWS                           | i sei sottopercorsi che non devono richiedere gli SDK (tutti tranne `./runtime`)                                                                       |
| `S7`     | go-runbook con i peer di `go-aws/all`                         | tutti e sette i sottopercorsi                                                                                                                          |
| `S8`     | go-runbook, go-aws, go-common e i peer, come la Lambda pilota | il bundle esbuild della Lambda (Node 24, ESM): nessun modulo vietato o nativo (la Lambda gira su ARM64), caricamento dei runbook, memoria sotto 256 MB |

Ogni scenario viene installato **due volte**:

- con **npm**, che mette tutte le dipendenze in un'unica cartella (come fa la maggior parte dei progetti);
- con **pnpm isolato**, dove ogni package vede **solo** quello che dichiara. È il caso più severo: una dipendenza non dichiarata salta fuori subito.

In tutti e due i casi l'installazione è stretta sulla versione di Node (`engine-strict`). Solo i package dello scenario e i peer sono dipendenze dirette del progetto di prova: gli altri `@pagopa/*` arrivano attraverso i `package.json`, come succederà a chi installa.

Esempio di output:

```text
ok   S4-s3 (npm)
ok   S4-s3 (pnpm)
ok   S8 (npm) — bundle 6000 KB, runbooks 72, RSS 100 MB
42/42 scenario runs passed on Node 26.12.1.
```

**A cosa serve.** Scopre gli errori che nel monorepo restano nascosti: una dipendenza non dichiarata, un import dell'SDK in un sottopercorso che non dovrebbe averlo, un tipo che non compila con le impostazioni severe, una libreria che chiede una versione di Node più nuova di quella che promettiamo.

**Quando usarlo.**

- prima di pubblicare (è dentro `test:published`);
- quando aggiorni una dipendenza nel catalog, soprattutto `undici` o gli SDK AWS;
- quando aggiungi una dipendenza a un package pubblicato.

**Opzioni.**

| Opzione                      | Cosa fa                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--scenario <id,…>`          | Esegue solo alcuni scenari. `S4` esegue tutti gli `S4-*`; `S4-s3` solo quello. Un id che non esiste fa fallire il comando. |
| `--manager npm` o `pnpm`     | Usa un solo installatore invece di tutti e due.                                                                            |
| `--keep`                     | Non cancella i progetti di prova e stampa dove sono: utile per capire un errore.                                           |
| `--pack-to <cartella>`       | Crea solo i pacchetti `.tgz` nella cartella, senza eseguire gli scenari. Lo usa la CI.                                     |
| `--from-tarballs <cartella>` | Usa pacchetti `.tgz` già pronti invece di crearli. Lo usa la CI, per provare gli stessi pacchetti su più versioni di Node. |
| `--print-node-matrix`        | Stampa le versioni di Node da provare e gli scenari di ognuna, calcolati dagli `engines` dei package (§6). Lo usa la CI.   |
| `--root <cartella>`          | Radice del monorepo (di default, la cartella corrente).                                                                    |

Esempi:

```bash
# solo gli scenari di go-aws, solo con pnpm
pnpm check:published-packages --scenario S4 --manager pnpm

# capire perché S6 fallisce: il progetto di prova resta su disco
pnpm check:published-packages --scenario S6 --keep
```

**Se fallisce.** Sotto la riga `FAIL` c'è il motivo:

- `import failed`: il sottopercorso non si carica. Di solito manca una dipendenza nel `package.json`, oppure il sottopercorso importa un SDK che lo scenario non installa.
- un errore `error TS…`: i tipi non compilano con le impostazioni severe.
- `declares node …, but … requires …`: una dipendenza chiede una versione di Node più nuova di quella promessa dal package. O si cambia la dipendenza, o si alza `engines.node`: alzarlo è un cambio **major**.
- `install failed`: l'installazione non è riuscita, spesso per la versione di Node.
- `Published subpaths without a scenario`: hai aggiunto un sottopercorso senza scenario (§5.1).

**Da sapere.** Serve internet: i peer e le dipendenze esterne si scaricano dal registry npm pubblico. I pacchetti `@pagopa/*` invece vengono sempre dai `.tgz` locali, mai da un registry.

### 4.7 `pnpm test:published` e `pnpm test:published:static`: tutto insieme

| Comando                      | Cosa esegue                                                                                  | Durata indicativa |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ----------------- |
| `pnpm test:published:static` | publint, attw, `api:report`, `check:import-cost`, `check:published`                          | 1 minuto          |
| `pnpm test:published`        | tutto il precedente più `check:published-packages`, sulla versione di Node che hai in locale | 3,5 minuti        |

**Quando usarli.** `test:published` prima di pubblicare, o quando vuoi rifare in locale quello che fa la CI.

### 4.8 `pnpm test:published:bins`: i test dei controlli

Esegue i test unitari dei tre strumenti (`check-published-packages`, `check-import-cost`, `check-api-report`). È già dentro `pnpm test:bins` e quindi dentro `pnpm test`. Serve solo se modifichi gli strumenti.

## 5. Casi particolari

### 5.1 Ho aggiunto un sottopercorso a un package pubblicato

1. Aggiungilo agli `exports` del `package.json`, e se serve ai peer.
2. **Se è di go-aws**: aggiungi il sottopercorso e i suoi peer SDK a `GO_AWS_SUBPATH_PEERS` in `bins/check-published-packages/src/scenarios.ts`. Gli scenari di go-common e go-runbook prendono i sottopercorsi da soli dai manifest.
3. Se serve, aggiungi un budget in `bins/check-import-cost/src/budgets.ts` (§10.4 della SPEC).
4. `pnpm build && pnpm api:report:update`: nasce il file `api/` del nuovo sottopercorso.
5. Aggiorna la tabella dei sottopercorsi nel README del package.

Se dimentichi il punto 2, `check:published-packages` fallisce con `Published subpaths without a scenario`.

### 5.2 Voglio provare una versione di Node diversa in locale

Gli scenari girano sulla versione di Node che esegue il comando. Per provare la versione minima (per esempio 22.19.0) senza installarla:

```bash
pnpm check:published-packages --pack-to /tmp/published-tarballs
N22=$(npx -y -p node@22.19.0 -- node -e "console.log(process.execPath)")
PATH="$(dirname "$N22"):$PATH" node --import tsx/esm bins/check-published-packages/src/index.ts \
  --from-tarballs /tmp/published-tarballs
```

## 6. Cosa fa la CI

In `.github/workflows/ci.yml` ci sono tre job, tutti richiesti per avere la CI verde (`ci-success`):

| Job                                 | Cosa fa                                                                                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Published Packages**              | `pnpm test:published:static` sulla build del job `Build`.                                                                                                                                                                      |
| **Published Packages (pack)**       | Crea i pacchetti `.tgz` **una volta sola**, su Node 24, e li carica come artefatto `published-tarballs`. Calcola anche le versioni di Node da provare (`--print-node-matrix`).                                                 |
| **Published Packages (Node x.y.z)** | Uno per ogni versione calcolata: scarica gli stessi pacchetti ed esegue i loro scenari con quella versione di Node. Il monorepo si installa su Node 24, poi si passa alla versione della cella per la parte "di chi installa". |

**Come si calcolano le versioni di Node.** Per ogni scenario si prendono gli `engines.node` dei package che installa. Lo scenario gira sulla **versione minima** che tutti accettano, e anche su **Node 24**, la versione della toolchain e della Lambda. Oggi tutti i package dichiarano `>=22.19.0`, quindi ci sono due celle: `22.19.0` e `24`, con tutti gli scenari.

Se un giorno go-runbook alzasse il minimo a `>=24.0.0`, la CI lo seguirebbe da sola: gli scenari di go-runbook passerebbero a `24.0.0`, mentre go-common resterebbe provato su `22.19.0`. Non c'è nessuna versione scritta a mano.

## 7. Dove sta il codice

| Strumento                            | Cartella                               | File da conoscere                                                                         |
| ------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Pacchetti installati da zero         | `bins/check-published-packages/`       | `scenarios.ts` (scenari e peer di go-aws), `nodeMatrix.ts` (versioni di Node)             |
| Costo di import                      | `bins/check-import-cost/`              | `budgets.ts` (soglie e librerie vietate)                                                  |
| Fotografia dell'API                  | `bins/check-api-report/`               | `renderApiReport.ts` (contenuto della fotografia), `probeValueExports.ts` (valore o tipo) |
| Dati sensibili (EVO-AWSACCT-OPUS-01) | `bins/check-published-sensitive-data/` | `published-sensitive-data.config.json` alla radice                                        |
| Fotografie generate                  | `packages/<package>/api/`              | non si modificano a mano                                                                  |

## 8. Domande frequenti

**Devo lanciare questi comandi a ogni modifica?** No. La CI li esegue a ogni PR. In locale servono quando cambi l'API (`api:report:update`) o vuoi capire un errore della CI.

**La CI fallisce su `api:report` ma non ho cambiato l'API.** Probabilmente hai cambiato un tipo usato da un export, anche se non esportato: per esempio una proprietà diventata facoltativa. Per chi installa è comunque un cambio dell'API. Guarda il diff dopo `pnpm api:report:update`.

**Il controllo del tempo di import fallisce solo sulla mia macchina.** Le soglie sono pensate per una macchina normale. Prova con `IMPORT_COST_TIME_FACTOR=2`. Se fallisce anche in CI, qualcosa carica davvero più di prima: guarda quante librerie esterne carica l'entrypoint.

**Perché provare sia npm sia pnpm?** Perché chi installa può usare l'uno o l'altro, e si comportano in modo diverso. pnpm isolato trova le dipendenze non dichiarate; npm è il caso più comune.

**Perché Node 22.19.0?** È la versione minima che i package dichiarano in `engines.node` (la impone `undici`). Se lo dichiariamo, dobbiamo provarlo: altrimenti è una promessa non verificata.

**Cosa sono i warning `npm warn Unknown project config`?** npm legge il `.npmrc` del monorepo, che contiene impostazioni di pnpm. Sono innocui.
