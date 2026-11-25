# send-sync-anagrafica

Confronta le tabelle Dynamo di anagrafica di SEND con i file che le dichiarano in
`pn-configuration`: oggetti che la tabella ha e il repository
non dichiara, oggetti che il repository dichiara e la tabella non ha, e oggetti che
entrambi hanno ma su cui non concordano.

Con `--sync` bonifica anche la differenza. **Senza, non scrive niente**: il
confronto è ciò che si vuole guardare _prima_.

> **Niente viene mai cancellato.** Ogni richiesta è una PUT, quindi un oggetto che
> la tabella ha e nessun file dichiara viene segnalato e ignorato.

## Come avviene il confronto

I file sono **NDJSON già in forma DynamoDB** (`{"cap":{"S":"83030"}}`), e la
tabella viene letta con `AWSDynamoDBService.scanRaw`, che **non** deserializza.
Non avvengono conversioni, quindi non si rischia di perdere dati: `{"N":"1.0"}` e
`{"N":"1"}` restano distinti, e `{"NULL":true}` resta distinto da un attributo assente.

### L'ordine degli attributi non conta

DynamoDB restituisce gli attributi nel proprio ordine, che non è necessariamente
quello del file: la `pn-EcAnagrafica` comincia con `sqsArn` mentre un file
potrebbe cominciare con `sqsName`. Confrontare il testo serializzato rischierebbe di
dichiarare diverso ogni oggetto, quando in realtà non lo sono.

### Categorie di esito

| Categoria        | Significa                                   |
| ---------------- | ------------------------------------------- |
| `different`      | Entrambi hanno l'oggetto, ma non concordano |
| `onlyLive`       | Solo la tabella ce l'ha                     |
| `onlyRepository` | Solo il file lo dichiara                    |
| `protectedItems` | Solo la tabella ce l'ha, **ed è atteso**    |

### Gli oggetti protetti

Un oggetto è **protetto** quando una tabella lo tiene di proposito e
nessun file di configurazione lo dichiara: ad esempio, `pn-cons-000` in
`pn-EcAnagrafica` e in `pn-SsAnagraficaClient`, `pn-norm-000` in
`pn-addressManager-AnagraficaClient`. Si dichiarano in `configs/tables.json`
con `protectedKey` (l'attributo di chiave e i valori attesi solo in tabella).

I motivi sono due, e opposti:

- **Solo in tabella** (`protectedItems`): non è differenza da sanare. Senza questa
  categoria lo stesso falso positivo comparirebbe a ogni esecuzione, e abituerebbe
  a ignorare la riga di quella tabella, dove prima o poi ci sarebbe una differenza vera.
  Sono contati a parte (`protected item(s) are expected live-only`).
- **Nel file** (`protected-in-file`): è un difetto, anche in sola lettura. Un
  file che dichiara un oggetto protetto, con `--sync`, **sovrascriverebbe**
  quello in tabella con un `PutRequest`. Per questo viene controllato a ogni esecuzione
  e fa uscire `1`; con `--sync` rifiuta l'intera esecuzione (vedi [Codici di
  uscita](#codici-di-uscita)).

Niente viene mai cancellato: la protezione riguarda la sovrascrittura, non la
rimozione.

## Come avviene la scrittura

### Viene riscritta solo la differenza, non tutto il file

Dopo il confronto si scrivono solo gli oggetti che differiscono: su una tabella come
`pn-addressManager-Cap` è la differenza fra una singola richiesta e 4000+ scritture.

### Due modalità di scrittura

| `syncMode`          | Comando          | Effetto                                        |
| ------------------- | ---------------- | ---------------------------------------------- |
| `replace` (default) | `BatchWriteItem` | Sostituisce l'intero oggetto                   |
| `merge`             | `UpdateItem`     | Modifica solo gli attributi che il file nomina |

### Gli attributi che una scrittura cancellerebbe

Una `PutRequest` sostituisce l'oggetto intero, quindi un attributo che la tabella
ha e il file invece non ha **sparisce senza comparire in nessun confronto**. Prima
di scrivere, vengono elencati quegli attributi per ciascun oggetto.

### `UnprocessedItems` non viene ignorato

In caso di _throttling_, gli oggetti rifiutati vengono ritentati con
_backoff_ ed i rimanenti sono **riportati** con _exit code_ 1.

### Scrittura in produzione: doppia conferma

`--sync` scrive anche su produzione, ma solo con **due** conferme:

1. il sì/no che copre tutte le scritture (`--yes` lo salta);
2. per **ogni profilo di produzione** su cui si scrive, il nome del profilo va
   **digitato** per intero. `--yes`, una variabile d'ambiente, un preset o un file di
   configurazione non rispondono mai a questa domanda, e senza terminale l'esecuzione
   fallisce: una scrittura in produzione non può girare non presidiata.

Un profilo è di produzione se vale **uno qualunque** di questi criteri: il nome
contiene come token `prod`, `prd` o `production`; l'account a cui risolvono le sue
credenziali è uno dei `GO_PRODUCTION_ACCOUNT_IDS` di go-script (quindi anche un
profilo senza marker); il nome contiene uno dei `guard.prodProfileMarkers`, che
possono solo aggiungere. Se l'account non si risolve (SSO scaduto) il profilo
è trattato come produzione. Sotto `--dry-run` non si scrive e non si digita nulla.

## Configurazione

### Parametri CLI

| Parametro         | Alias   | Obbl. | Default      | Descrizione                                          |
| ----------------- | ------- | :---: | ------------ | ---------------------------------------------------- |
| `--config-path`   | `--cp`  |  si   | —            | Checkout locale di `pn-configuration`                |
| `--env`           | `--ev`  |  si   | —            | `test` \| `uat` \| `hotfix` \| `prod`                |
| `--aws-profiles`  | `--aps` |  si   | —            | Profili SSO dei **due** account, separati da virgola |
| `--aws-region`    | `--ar`  |  no   | `eu-south-1` | Regione delle tabelle                                |
| `--table-names`   | `--tn`  |  no   | tutte        | Restringe l'esecuzione a queste tabelle              |
| `--sync`          | `--sy`  |  no   | `false`      | Scrive la differenza su DynamoDB.                    |
| `--dry-run`       | `--dr`  |  no   | `false`      | Con `--sync`: mostra le scritture, non ne invia      |
| `--yes`           | `--y`   |  no   | `false`      | Salta il sì/no, **non** la conferma digitata in prod |
| `--output-file`   | `--of`  |  no   | —            | Resoconto di **tutti** gli oggetti diversi           |
| `--output-format` | `--ofm` |  no   | `json`       | Formato del resoconto                                |

### Parametri del gruppo `Resources`

Arrivano da `configs/config.json` e si passano a riga di comando solo per
sovrascriverne uno. Non hanno alias: un alias viene risolto contro tutti i
provider, e `GOEnvironmentConfigProvider` carica l'intero `process.env`.

| Parametro                      | Descrizione                                                |
| ------------------------------ | ---------------------------------------------------------- |
| `--accounts-core`              | Nome del profilo SSO per l'account core                    |
| `--accounts-confinfo`          | Nome del profilo SSO per l'account confinfo                |
| `--configuration-conf-dir`     | Directory di configurazione per account dentro un ambiente |
| `--configuration-dynamodb-dir` | Directory dei file di tabella dentro un account            |
| `--configuration-tables-file`  | File che dichiara tabelle, account e schema di chiave      |
| `--environments-allowed`       | Ambienti serviti oltre a produzione, sempre ammessa        |
| `--guard-prod-profile-markers` | Frammenti di nome che marcano un profilo come produzione   |

### `configs/tables.json`

La mappa delle tabelle: per ognuna l'account che la possiede, lo schema di
chiave, l'eventuale `protectedKey`, l'eventuale `syncMode` e l'eventuale
`environments`. Sono **dati e non codice** perchè nomi di risorse, e nessuno dei
due è deducibile dal percorso del file.

`environments` elenca gli ambienti in cui la tabella è definita: non esiste
ovunque (le `pn-Paper*` non sono in `test`, `pn-Campaigns` non ha file in
`hotfix`, le `pn-AuthJwt*` non hanno file in nessun ambiente). Fuori da quella
lista la tabella non viene né letta né confrontata ed è riportata come
`not-defined`: non è un errore, non fa fallire l'esecuzione nemmeno con
`--strict-configuration`, e se il repository ha comunque un file lo nomina. Senza
`environments` la tabella vale per tutti gli ambienti; con la lista vuota non
vale per nessuno (ancora).

## Prerequisiti

- Login SSO su **entrambi** gli account dell'ambiente: ogni tabella viene
  instradata verso quello che la possiede, e una lettura sull'account sbagliato
  non risponde diversamente, fallisce.
- Un checkout di `pn-configuration` sul branch da confrontare.

## Utilizzo

### Esempi d'uso

Ogni caso è dato nelle **tre forme equivalenti**: `pnpm go` dalla root del monorepo, lo script di root `pnpm send:sync:anagrafica:dev` e il wrapper `go-cli` dove è installato.

#### Script di root

Gli script di root sono gli stessi degli altri script del monorepo:

```bash
# Dev (tsx, senza build)
pnpm send:sync:anagrafica:dev --cp … --ev test --aps …

# Production (build + node)
pnpm send:sync:anagrafica:build
pnpm send:sync:anagrafica:prod --cp … --ev test --aps …
```

#### 1. Il confronto completo di un ambiente

Sola lettura, ed è il modo normale di usarlo: 17 tabelle, repository contro Parameter Store, in entrambi i versi.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test
pnpm send:sync:anagrafica:dev --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test
```

#### 2. Una tabella sola, quando si sta guardando una differenza precisa

`--table-names` restringe il confronto. Su un'esecuzione ristretta i file non configurati non vengono cercati, perchè sarebbero tutti non configurati per costruzione.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --tn pn-EcAnagrafica
pnpm send:sync:anagrafica:dev --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --tn pn-EcAnagrafica
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --tn pn-EcAnagrafica
```

#### 3. Cosa scriverebbe un sync, senza scriverlo

Viene pianificata **solo la drift**, non ogni riga del file. E gli attributi che un replace cancellerebbe sono elencati **prima** della domanda: un `PutRequest` sostituisce l'oggetto intero, e un attributo che la tabella ha e il file no sparirebbe senza comparire in nessuna diff di oggetti.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync --dry-run
pnpm send:sync:anagrafica:dev --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync --dry-run
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync --dry-run
```

#### 4. Il sync vero

Niente viene mai cancellato: gli oggetti che vivono in tabella e che nessun file dichiara sono riportati e lasciati stare.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync
pnpm send:sync:anagrafica:dev --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync
```

#### 5. Scrivere in produzione

Prima la dry run: mostra le scritture e non chiede di digitare nulla.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev prod --aps send-core-prod,send-confinfo-prod --sync --dry-run
pnpm send:sync:anagrafica:dev --cp ~/workspaces/pagopa/send/pn-configuration --ev prod --aps send-core-prod,send-confinfo-prod --sync --dry-run
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev prod --aps send-core-prod,send-confinfo-prod --sync --dry-run
```

Poi il sync vero: oltre al sì/no, la seconda conferma chiede di digitare il nome di ogni profilo di produzione.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev prod --aps send-core-prod,send-confinfo-prod --sync
pnpm send:sync:anagrafica:dev --cp ~/workspaces/pagopa/send/pn-configuration --ev prod --aps send-core-prod,send-confinfo-prod --sync
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev prod --aps send-core-prod,send-confinfo-prod --sync
```

#### 6. Far fallire l'esecuzione quando manca un file, o ne avanza uno

Una tabella che l'ambiente definisce e che non ha file (`missing-file`), o un file che la mappa non dichiara (`unconfigured`), sono riportati ma di default non fanno fallire l'esecuzione. `--strict-configuration` è per chi sa che non dovrebbero esserci. Le tabelle `not-defined` non contano mai.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --stc
pnpm send:sync:anagrafica:dev --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --stc
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --stc
```

#### Riepilogo con `go-cli`

```bash
go-cli send-sync-anagrafica \
  --cp ~/workspaces/pagopa/send/pn-configuration \
  --ev test \
  --aps send-core-test,send-confinfo-test \
  --of anagrafica-drift.json

# Una tabella sola
go-cli send-sync-anagrafica --cp … --ev test --aps … --tn pn-addressManager-Cap

# Cosa scriverebbe un sync, senza scrivere niente
go-cli send-sync-anagrafica --cp … --ev test --aps … --sync --dry-run

# Scrivere davvero
go-cli send-sync-anagrafica --cp … --ev test --aps … --sync
```

La conferma viene chiesta **anche** sotto `--dry-run`, con un testo diverso: se
il dry run saltasse la domanda diventerebbe il modo per aggirarla.

## Codici di uscita

**Una differenza da sanare non è un fallimento**: è la risposta che si cerca, quindi
esce `0`. Esce `1` quando l'esecuzione non può rispondere: una scan rifiutata,
un file non processato, una tabella dichiarata senza file (`missing-file`),
un file non dichiarato (`unconfigured`), un file che dichiara un oggetto
protetto (`protected-in-file`). Con `--sync`, esce `1` anche se una scrittura
non è andata a buon fine.

Il controllo prima delle scritture è **per tabella**: una tabella che non si è
potuta leggere non viene mai pianificata, perchè solo una `drifted` lo è.
Quindi `--sync` scrive le tabelle che hanno risposto e lascia stare le altre,
specificando nella domanda di conferma quante non hanno risposto.

L'unica eccezione è `protected-in-file`, che rifiuta **l'intera esecuzione**: le altre
tabelle si scrivono a partire dallo stesso repository, e un file che dichiara un
oggetto di proprietà dell'ambiente dice che quell'insieme di file non è
affidabile in blocco.

Le tabelle non definite nell'ambiente (`not-defined`) non contano: su `test`
`pn-AuthJwtIssuers`, `pn-AuthJwtAttributes` e le `pn-Paper*` sono riportate e
saltate. Una tabella che l'ambiente definisce e che non ha file (`missing-file`)
continua a essere riportata, e fa fallire solo con `--strict-configuration`.
