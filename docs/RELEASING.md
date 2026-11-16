# Versioni e rilasci dei package pubblicati

> Come si dichiarano le modifiche, come si fa un rilascio e cosa controlla la CI per `@pagopa/go-common`, `@pagopa/go-aws` e `@pagopa/go-runbook`. Le regole vengono da [EVO-PKGPUB-OPUS-01](evolutions/EVO-PKGPUB-OPUS-01.md) §9.2, §9.3 e §10.3.
>
> Data: 2026-11-16.

## Spiegazione semplice: a cosa serve e come funziona

### Il problema

go-watchtower, e in futuro altri repository, installano i nostri package come si installa una libreria qualsiasi: "go-runbook versione 1.3.0". Ogni volta che cambiamo qualcosa bisogna quindi:

1. **dare un nuovo numero di versione**, e quello giusto: un numero sbagliato può rompere chi aggiorna;
2. **scrivere cosa è cambiato**, nel `CHANGELOG.md`;
3. **pubblicare** su GitHub Packages esattamente il codice che abbiamo controllato.

Fatto a mano sarebbe pieno di errori: dimenticare di alzare la versione, scegliere il numero sbagliato, pubblicare dal proprio computer qualcosa di non committato. Il flusso descritto qui automatizza questi tre passi e impedisce gli errori.

### L'idea: un "biglietto" per ogni modifica

Lo strumento si chiama **Changesets**. Funziona così.

**1. Mentre lavori (ogni PR).** Per esempio, aggiungi un runbook a go-runbook. Prima di aprire la PR lanci:

```bash
pnpm changeset
```

Il comando chiede quale package hai cambiato (go-runbook), che tipo di cambio è (qui "minor", cioè un'aggiunta) e una frase di descrizione. Crea un piccolo file in `.changeset/`, il "biglietto", che si committa insieme al codice. Non si tocca nessun numero di versione.

**2. I biglietti si accumulano.** Le PR vengono mergiate in `develop`, ognuna con il suo biglietto. Nessuna pubblica niente.

**3. Il giorno del rilascio.** Si crea un branch `release/2026-11-20` e si lancia:

```bash
pnpm changeset version
```

Il comando legge tutti i biglietti accumulati e:

- calcola le nuove versioni (per esempio go-runbook da 1.2.0 a 1.3.0);
- scrive il `CHANGELOG.md` con le frasi dei biglietti;
- cancella i biglietti usati.

Si apre la PR verso `develop` e la si mergia con **"Create a merge commit"**.

**4. Al merge pubblica la CI, da sola.** La CI rifà tutti i controlli, pubblica i package e crea i tag git (per esempio `@pagopa/go-runbook@1.3.0`). Dal proprio computer non si pubblica mai.

### A cosa servono i controlli sulle PR ("Release Guards")

Ogni PR passa da un controllo, diverso a seconda del tipo di PR:

| Tipo di PR                          | Cosa controlla                                                                                                         | Cosa impedisce                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **PR normale**                      | se tocca go-common, go-aws o go-runbook, c'è il biglietto per ogni package toccato                                     | la modifica che non finisce mai in un rilascio, o che finisce con la versione sbagliata |
| **PR di rilascio** (`release/*`)    | contiene **solo** versioni, changelog e biglietti consumati; la CI rifà il calcolo e il risultato deve essere identico | infilare codice nella PR di rilascio, o versioni scritte a mano                         |
| **Promozione** (`develop` → `main`) | le versioni che arrivano su `main` sono state davvero pubblicate                                                       | portare su `main` versioni mai rilasciate                                               |

Il controllo gira con il codice del branch di destinazione, non con quello della PR, così una PR non può modificare le regole che la giudicano.

### Se qualcosa va storto

Ogni giorno un controllo automatico verifica che ogni rilascio sia completo: pubblicato, con i tag e con i canali giusti. Se un rilascio è rimasto a metà (per esempio go-common pubblicato e go-aws no):

- i rilasci successivi restano bloccati;
- il messaggio di errore indica quale commit usare per rilanciare il rilascio a mano dal branch `develop`.

Il rilancio pubblica solo quello che manca (§7).

### La prima volta: `next`

Oggi i package sono alla versione `0.0.0`. Il primo rilascio li porta a `1.0.0-next.0`, una versione "di prova" sul canale `next` che go-watchtower usa per il pilota. Quando tutto funziona si esce dalla prova e si pubblica `1.0.0` (§5).

### Cosa cambia in pratica

- **Ogni PR** che tocca go-common, go-aws o go-runbook: `pnpm changeset`, oppure `pnpm changeset --empty` se non serve un rilascio (un test, un commento). Senza, la PR resta bloccata.
- **Non toccare mai** a mano il campo `version` dei package pubblicati né i loro `CHANGELOG.md`.
- **Per rilasciare:** branch `release/...`, `pnpm changeset version`, PR, merge con "Create a merge commit" (§4).
- **Una volta sola, su GitHub:** rendere obbligatori i controlli `CI Success` e `Release Guards` su `develop` e `main` (§8).

Le sezioni seguenti entrano nei dettagli.

## 1. In breve

- Ogni PR che cambia un package pubblicato porta con sé una **changeset**: un piccolo file in `.changeset/` che dice quale package cambia e se serve una versione patch, minor o major.
- Le versioni **non si cambiano a mano**. Le cambia `pnpm changeset version`, e solo dentro una **PR di rilascio** (branch `release/<data>` verso `develop`).
- La **pubblicazione** la fa solo la CI, al merge della PR di rilascio, partendo esattamente da quel commit. Nessuno pubblica dal proprio computer.
- **Un rilascio alla volta:** finché un rilascio non è completo (pubblicato, con i tag git e i canali giusti), il successivo è bloccato.

Lo strumento è [Changesets](https://changesets.dev), versione 3.

## 2. Le tre categorie di PR

La CI classifica ogni PR guardando il branch di partenza e quello di arrivo. Il nome del branch da solo non dà nessun privilegio: ogni categoria deve superare il proprio controllo.

| Categoria      | Come si riconosce                                | Cosa verifica il controllo **Release Guards**                                                                                                                                   |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contributo** | tutte le PR normali                              | ogni package pubblicato modificato è nominato in una changeset della PR (oppure c'è una changeset vuota); nessuna versione, `CHANGELOG.md` o file di prerelease cambiati a mano |
| **Rilascio**   | `release/*` → `develop`, dallo stesso repository | la PR tocca solo i file del rilascio; i rilasci precedenti sono completi; il risultato è identico a `changeset version`                                                         |
| **Promozione** | `develop` → `main`, dallo stesso repository      | ogni versione portata in `main` è già stata rilasciata (ha il suo tag git); i rilasci precedenti sono completi                                                                  |

**Perché una PR non può "promuovere sé stessa".** Il controllo gira nel workflow `.github/workflows/release-guards.yml`, avviato con `pull_request_target`: GitHub usa la versione del workflow presente sul branch di **destinazione**, e il job esegue il codice e le dipendenze di quel branch. La PR viene letta solo come dati (i suoi file tramite git): nulla di suo viene installato o eseguito. Così una PR non può modificare le regole che la giudicano; una modifica alle regole vale solo dopo essere stata revisionata e mergiata.

## 3. Ogni giorno: aggiungere una changeset

### Quando serve

Quando la PR modifica qualcosa dentro `packages/go-common`, `packages/go-aws` o `packages/go-runbook`: codice, test, README, anche un runbook nuovo. Vale anche quando cambia una versione nel `catalog` di `pnpm-workspace.yaml` usata da un package pubblicato (per esempio `undici`): il package pubblicato cambia le sue dipendenze anche se la sua cartella è intatta. Ogni package modificato deve comparire in una changeset della PR: se la PR tocca go-common e go-runbook, la changeset (o le changeset) deve nominarli entrambi. Altrimenti il controllo **Release Guards** fallisce.

### Come

```bash
pnpm changeset
```

Il comando chiede quali package sono cambiati e che tipo di versione serve, poi una frase di descrizione, e crea un file come questo:

```markdown
---
'@pagopa/go-runbook': minor
---

Nuovo runbook per l'allarme pn-delivery-B2B-ApiGwAlarm.
```

Committa il file insieme al codice. La frase finisce nel `CHANGELOG.md` del package al prossimo rilascio, quindi scrivila per chi usa il package.

### Patch, minor o major?

| Tipo      | Quando                                                                                                                                             | Esempio                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **patch** | correzione che non cambia l'API                                                                                                                    | un bug in una query, un messaggio di errore                       |
| **minor** | aggiunta compatibile                                                                                                                               | un nuovo runbook, un nuovo export, un nuovo campo facoltativo     |
| **major** | modifica che può rompere chi usa il package: togliere o rinominare un export, un sottopercorso o un campo di un'interfaccia; alzare `engines.node` | rinominare `RunbookOutput.outcome`, togliere `@pagopa/go-aws/ec2` |

Il report API (`packages/*/api/`, vedi [PUBLISHED_PACKAGES_CHECKS.md](PUBLISHED_PACKAGES_CHECKS.md) §4.3) aiuta a capirlo: se il suo diff toglie o cambia qualcosa, di solito è un major.

### Quando la modifica non richiede un rilascio

Per esempio un test, un commento o un refactoring interno senza effetti per chi usa il package:

```bash
pnpm changeset --empty
```

Crea una changeset vuota: dichiara che la PR non richiede rilasci, soddisfa il controllo e non produce nessuna versione. Vale per tutta la PR: se una parte va rilasciata, usa una changeset normale per quella.

### Cosa non fare in una PR normale

Il controllo le rifiuta, perché cambiano solo nelle PR di rilascio:

- modificare il campo `version` di un package pubblicato;
- modificare un `CHANGELOG.md` dei package pubblicati;
- toccare `.changeset/pre.json` o la cartella `.changeset/pre/`.

## 4. Fare un rilascio

### Procedura

```bash
git switch develop && git pull
git switch -c release/2026-11-20            # il prefisso release/ identifica la PR di rilascio
pnpm changeset status --verbose             # cosa verrà rilasciato, con quali versioni
GITHUB_TOKEN=$(gh auth token) pnpm changeset version
git add -A && git commit -m "chore(release): version packages"
git push -u origin HEAD                     # poi apri la PR verso develop
```

`pnpm changeset version` aggiorna le versioni e i `CHANGELOG.md` e consuma le changeset. Ha bisogno di `GITHUB_TOKEN` perché scrive nel changelog i link alle PR e agli autori.

### Cosa controlla la CI sulla PR di rilascio (Release Guards)

1. **Perimetro.** La PR può cambiare solo: il campo `version` (e i range interni `@pagopa/*`) dei `package.json` pubblicati, i `CHANGELOG.md`, le changeset consumate (cancellate, o spostate in `.changeset/pre/` durante la prerelease) e `.changeset/pre.json`. Qualsiasi altro file la blocca.
2. **Rilasci precedenti completi.** Se un rilascio precedente non è stato pubblicato del tutto, la PR resta bloccata finché non viene recuperato (§7).
3. **Riproducibilità.** La CI rifà `changeset version` sul branch base e confronta il risultato con la PR: deve essere identico. L'unico canale di prerelease ammesso è `next`.

Se il punto 3 fallisce, di solito `develop` è andato avanti dopo che hai creato il branch: aggiorna il branch da `develop` e rifai `pnpm changeset version`.

### Al merge

La PR di rilascio va mergiata con **"Create a merge commit"**, mai con squash o rebase: solo con un vero commit di merge la CI ricava con certezza tutte le versioni decise dalla PR. Un rilascio mergiato in altro modo viene rifiutato dal workflow e segnalato dall'audit.

Il workflow **Release** (`.github/workflows/release.yml`):

1. verifica che il commit venga davvero dal merge di una PR di rilascio;
2. si posiziona esattamente su quel commit;
3. esegue build e tutti i controlli di pubblicazione (`pnpm test:published`);
4. pubblica con `pnpm changeset publish`: sul canale `next` durante la prerelease, altrimenti su `latest`;
5. crea i tag git `<package>@<versione>`, allinea i canali `latest` e `next` e invia i tag.

`latest` esiste sul registry prima di arrivare in `main`: la promozione `develop` → `main` porta in `main` versioni già pubblicate e non pubblica nulla.

## 5. Il primo rilascio e la prerelease `next`

Oggi i tre package sono alla versione `0.0.0` e non sono mai stati pubblicati. In `.changeset/initial-release.md` c'è già la changeset di partenza (major per tutti e tre).

**Primo rilascio** (Fase 5 della SPEC), nella PR `release/bootstrap-next`:

```bash
pnpm changeset pre enter next
GITHUB_TOKEN=$(gh auth token) pnpm changeset version   # tutti e tre a 1.0.0-next.0
```

**Durante la prerelease**, ogni rilascio successivo produce `1.0.0-next.1`, `1.0.0-next.2`, … sul canale `next`. Changesets 3 sposta le changeset consumate in `.changeset/pre/`, invece di cancellarle.

**Uscita dalla prerelease** (versione stabile `1.0.0` su `latest`), in una PR di rilascio:

```bash
pnpm changeset pre exit
GITHUB_TOKEN=$(gh auth token) pnpm changeset version   # 1.0.0; pre.json e .changeset/pre/ vengono rimossi
```

Prima della `1.0.0` vanno sistemati i tipi segnalati nella sezione "Referenced but not exported" dei report API.

## 6. Promozione `develop` → `main`

È una PR normale da `develop` a `main`. **Release Guards** controlla che ogni versione portata in `main` sia già stata rilasciata, cioè che abbia il suo tag git su un commit di `develop`. Nel riepilogo del job elenca anche le changeset non ancora rilasciate. Una versione senza tag (rilascio non ancora pubblicato, o modificata fuori dalla procedura) blocca la promozione.

## 7. Se qualcosa va storto

Ogni giorno il workflow **Release Audit** (`.github/workflows/release-audit.yml`) controlla, in sola lettura, che ogni PR di rilascio mergiata sia pubblicata, abbia i tag e abbia i canali allineati. Lo stesso controllo gira nelle PR di rilascio e di promozione.

**Esempio:** un rilascio pubblica go-common ma fallisce su go-aws.

1. go-common riceve comunque tag e canale. Il rilascio resta incompleto e nessuna nuova PR di rilascio può essere mergiata.
2. Rilancia il job (_Re-run failed jobs_), oppure avvia il workflow **Release** a mano (_Run workflow_, **dal branch `develop`**) con `release_sha` uguale al commit di merge della PR di rilascio. Il messaggio di errore dell'audit indica il `release_sha` esatto, anche quando il problema è solo un canale (`latest`/`next`) da riallineare.
3. Il workflow torna esattamente su quel commit, salta go-common (già pubblicato) e pubblica go-aws.
4. L'audit torna verde e i rilasci successivi si sbloccano.

Il workflow manuale parte solo da `develop`, usa sempre il codice di verifica di `develop` e accetta solo commit di merge di PR di rilascio, verificati tramite le API di GitHub: non si può usare per pubblicare un commit qualsiasi.

## 8. Impostazioni da fare una volta (amministratore del repository)

- **Branch protection su `develop` e `main`:** rendere obbligatori i controlli `CI Success` e **`Release Guards`**. Senza `Release Guards` obbligatorio, una PR potrebbe essere mergiata anche con il controllo fallito.
- **Merge commit su `develop`:** lasciare attiva l'opzione "Allow merge commits", che serve alle PR di rilascio (§4).
- **Su `develop`:** attivare anche "Require branches to be up to date before merging". Serve alla regola "un rilascio alla volta" (§9.3, regola 3).
- **Rischio residuo da conoscere:** su GitHub chiunque abbia accesso in scrittura al repository può aggiungere su un proprio branch un workflow che chiede il permesso `packages: write` e pubblica. Nessun controllo dentro il repository lo impedisce: la difesa sono le persone con accesso in scrittura, la review e, se serve, le regole dell'organizzazione sui workflow. Il flusso di questa guida garantisce invece che i rilasci fatti con la procedura pubblichino solo commit validati.
- **Accesso dei repository consumatori:** su GitHub, nelle _Package settings_ di ogni package, _Manage Actions access → Add repository_ (ruolo `Read`), per esempio per `go-watchtower`.
- **Rischio R1 non verificato:** la Fase 0 della SPEC (package di prova) è stata saltata per decisione del 2026-11-16. Il primo rilascio verifica sul campo la pubblicazione con il `GITHUB_TOKEN` e l'installazione da un altro repository. Chi installa i package con `@pagopa:registry=https://npm.pkg.github.com` cerca **tutti** i `@pagopa/*` su GitHub Packages: se usa anche package `@pagopa/*` pubblici di npmjs, li deve installare in altro modo.

## 9. I comandi

| Comando                                      | Chi lo usa      | Cosa fa                                                              |
| -------------------------------------------- | --------------- | -------------------------------------------------------------------- |
| `pnpm changeset`                             | chi apre una PR | crea una changeset                                                   |
| `pnpm changeset --empty`                     | chi apre una PR | crea una changeset vuota (nessun rilascio)                           |
| `pnpm changeset status --verbose`            | chi rilascia    | mostra cosa verrebbe rilasciato                                      |
| `pnpm changeset version`                     | chi rilascia    | applica le changeset: versioni e `CHANGELOG.md` (con `GITHUB_TOKEN`) |
| `pnpm changeset pre enter next` / `pre exit` | chi rilascia    | entra o esce dalla prerelease `next`                                 |
| `pnpm check:release-state <comando>`         | la CI           | i controlli e le operazioni di rilascio, vedi sotto                  |

`pnpm check:release-state` (`bins/check-release-state`) ha questi sottocomandi:

| Sottocomando         | Dove gira            | Cosa fa                                                                                                           |
| -------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `resolve-sha`        | Release              | trova il commit da pubblicare e verifica che venga da una PR di rilascio                                          |
| `reconcile-tags`     | Release              | crea i tag git mancanti delle versioni del rilascio già pubblicate                                                |
| `promote-channels`   | Release              | porta `latest` sulla versione stabile più alta e `next` sulla `-next.*` più alta, se è più avanti                 |
| `audit`              | Release Audit, guard | controlla che tutti i rilasci siano completi; in sola lettura                                                     |
| `contribution-guard` | Release Guards       | ogni package modificato è in una changeset; nessuna versione, `CHANGELOG.md` o file di prerelease cambiati a mano |
| `release-pr-guard`   | Release Guards       | perimetro, rilasci precedenti e riproducibilità della PR di rilascio                                              |
| `promotion-guard`    | Release Guards       | versioni già rilasciate e rilasci precedenti completi                                                             |

In locale servono di rado. `audit` richiede un `GITHUB_TOKEN` con lettura delle PR e l'accesso a GitHub Packages; i guard accettano `--base <sha> --head <sha>` al posto dei dati dell'evento della CI.
