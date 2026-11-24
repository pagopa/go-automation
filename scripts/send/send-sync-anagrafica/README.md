# send-sync-anagrafica

Confronta le tabelle di anagrafica di SEND con i file che le dichiarano in
`pn-configuration`: oggetti che la tabella ha e il repository
non dichiara, oggetti che il repository dichiara e la tabella non ha, e oggetti che
entrambi hanno ma su cui non concordano.

Con `--sync` riscrive anche la drift. **Senza, non scrive niente**: il
confronto è ciò che si vuole guardare _prima_.

> **Niente viene mai cancellato.** Ogni richiesta è una PUT, quindi un oggetto che
> la tabella ha e nessun file dichiara viene riportato e ignorato.

## Come avviene il confronto

I file sono **NDJSON già in forma DynamoDB** (`{"cap":{"S":"83030"}}`), e la
tabella viene letta con `AWSDynamoDBService.scanRaw`, che **non** deserializza.
Non avvengono conversioni, quindi non si rischia di perdere dati:`{"N":"1.0"}` e `{"N":"1"}` restano distinti, e `{"NULL":true}` resta distinto da un attributo assente.

### L'ordine degli attributi non conta

DynamoDB restituisce gli attributi nel proprio ordine, che non è necessariamente
quello del file: la `pn-EcAnagrafica` comincia con `sqsArn` mentre il file
potrebbe cominciare con`sqsName`. Confrontare il testo serializzato rischierebbe di
dichiarare diverso ogni oggetto, quando in realtà non lo sono.

### Categorie di esito

| Categoria        | Significa                                       |
| ---------------- | ----------------------------------------------- |
| `different`      | Entrambi hanno l'oggetto, ma non concordano     |
| `onlyLive`       | Solo la tabella ce l'ha                         |
| `onlyRepository` | Solo il file lo dichiara                        |
| `protectedItems` | Solo la tabella ce l'ha, **ed è atteso**       |

## Come avviene la scrittura

### Si scrive solo la differenza, non tutto il file

Dopo il confronto si scrivono solo gli oggetti che differiscono: su una tabella come
`pn-addressManager-Cap` è la differenza fra una singola richiesta e 4000+ reinserimenti.

### Due modalità di scrittura

| `syncMode`          | Comando          | Effetto                                        |
| ------------------- | ---------------- | ---------------------------------------------- |
| `replace` (default) | `BatchWriteItem` | Sostituisce l'intero oggetto                   |
| `merge`             | `UpdateItem`     | Modifica solo gli attributi che il file nomina |

### Gli attributi che una scrittura cancellerebbe

Un `PutRequest` sostituisce l'oggetto intero, quindi un attributo che la tabella
ha e il file invece non ha **sparisce senza comparire in nessuna diff**. Prima
di scrivere, vengono elencati quegli attributi per ciascun oggetto.

### `UnprocessedItems` non viene ignorato

In caso di _throttling_, gli oggetti rifiutati vengono ritentati con
_backoff_ ed i rimanenti sono **riportati** con _exit code_ 1.

## Configurazione

### Parametri CLI

| Parametro         | Alias   | Obbl. | Default      | Descrizione                                             |
| ----------------- | ------- | :---: | ------------ | ------------------------------------------------------- |
| `--config-path`   | `--cp`  |  si   | —            | Checkout locale di `pn-configuration`                   |
| `--env`           | `--ev`  |  si   | —            | `test` \| `uat` \| `hotfix`                             |
| `--aws-profiles`  | `--aps` |  si   | —            | Profili SSO dei **due** account, separati da virgola    |
| `--aws-region`    | `--ar`  |  no   | `eu-south-1` | Regione delle tabelle                                   |
| `--table-names`   | `--tn`  |  no   | tutte        | Restringe l'esecuzione a queste tabelle                 |
| `--sync`          | `--sy`  |  no   | `false`      | Scrive la differenza su DynamoDB.                       |
| `--yes`           | —       |  no   | `false`      | Salta la conferma che copre tutte le scritture          |
| `--output-file`   | `--of`  |  no   | —            | Resoconto di **tutti** gli oggetti diversi              |
| `--output-format` | `--ofm` |  no   | `json`       | Formato del resoconto                                   |

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

### `configs/tables.json`

La mappa delle tabelle: per ognuna l'account che la possiede, lo schema di
chiave, l'eventuale `protectedKey` e l'eventuale `syncMode`. Sono **dati e non
codice** perchè nomi di risorse, e nessuno dei due è deducibile dal percorso
del file.

## Prerequisiti

- Login SSO su **entrambi** gli account dell'ambiente: ogni tabella viene
  instradata verso quello che la possiede, e una lettura sull'account sbagliato
  non risponde diversamente, fallisce.
- Un checkout di `pn-configuration` sul branch da confrontare.

## Utilizzo

### Esempi d'uso

Ogni caso è dato nelle **due forme equivalenti**: `pnpm go` dalla root del monorepo, e il wrapper `go-cli` dove è installato.

**1. Il confronto completo di un ambiente**

Sola lettura, ed è il modo normale di usarlo: 16 tabelle, repository contro Parameter Store vivo, in entrambi i versi.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test
```

**2. Una tabella sola, quando si sta guardando una differenza precisa**

`--table-names` restringe il confronto. Su una run ristretta i file non configurati non vengono cercati, perchè sarebbero tutti non configurati per costruzione.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --tn pn-EcAnagrafica
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --tn pn-EcAnagrafica
```

**3. Cosa scriverebbe un sync, senza scriverlo**

Viene pianificata **solo la drift**, non ogni riga del file. E gli attributi che un replace cancellerebbe sono elencati **prima** della domanda: un `PutRequest` sostituisce l'oggetto intero, e un attributo che la tabella ha e il file no sparirebbe senza comparire in nessuna diff di oggetti.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync --dry-run
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync --dry-run
```

**4. Il sync vero**

Niente viene mai cancellato: gli oggetti che vivono in tabella e che nessun file dichiara sono riportati e lasciati stare.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync
```

**5. Far fallire la run quando manca un file, o ne avanza uno**

Due tabelle sono dichiarate e non hanno file in **nessuno** dei cinque alberi, quindi di default quelle righe sono riportate ma non fanno fallire. `--strict-configuration` è per chi sa che non dovrebbero esserci.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --stc
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --stc
```

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

**La differenza non è un fallimento**: è la risposta che si era chiesta, quindi
esce `0`. Esce `1` quando l'esecuzione non può rispondere — una scan rifiutata,
un file non processato, una tabella dichiarata senza file (`missing-file`),
un file che la mappa non dichiara (`unconfigured`), un file che dichiara un oggetto
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

Su `test` oggi `pn-AuthJwtIssuers` e `pn-AuthJwtAttributes` sono dichiarate
nella mappa e non hanno file: la run esce `1` per questo, ed è corretto.
