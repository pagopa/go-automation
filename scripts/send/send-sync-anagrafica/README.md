# send-sync-anagrafica

Confronta le tabelle di anagrafica di SEND con i file che le dichiarano in
`pn-configuration`, nei **due versi**: item che la tabella ha e il repository
non dichiara, item che il repository dichiara e la tabella non ha, e item che
entrambi hanno ma su cui non concordano.

Con `--sync` riscrive anche la drift. **Senza, non scrive niente**: il
confronto e' cio' che si vuole guardare _prima_.

> **Niente viene mai cancellato.** Ogni richiesta e' un put, quindi un item che
> la tabella ha e nessun file dichiara viene riportato e lasciato stare. Vale
> anche per il riferimento `anagrafica_upsert`
> (`pagopa/pn-infra/scripts/anagrafica_upsert`), che non emette nessun
> `DeleteRequest`. Un test verifica che non compaia un parametro che cancella.

## Com'e' fatto il confronto

### Si confronta la forma wire, non i valori

I file sono **NDJSON gia' in forma DynamoDB** (`{"cap":{"S":"83030"}}`), e la
tabella viene letta con `AWSDynamoDBService.scanRaw`, che apposta **non**
deserializza. Nessuno dei due lati viene convertito, quindi nessuno dei due
puo' perdere qualcosa convertendolo: `{"N":"1.0"}` e `{"N":"1"}` restano
distinti, e `{"NULL":true}` resta distinto da un attributo assente.

Corollario: `upsert_dynamodb` di `pn-troubleshooting` **non e' il riferimento di
questi file**. Chiama `marshall()` su ogni riga, e su una riga gia' in forma
wire produce `{"cap":{"M":{"S":{"S":"83030"}}}}`.

### L'ordine degli attributi non conta

DynamoDB restituisce gli attributi nel proprio ordine, che non e' quello del
file: la `pn-EcAnagrafica` viva comincia con `sqsArn` dove il file comincia con
`sqsName`. Confrontare il testo serializzato dichiarerebbe diverso ogni item.

### Quattro categorie, non tre

| Categoria        | Significa                                       |
| ---------------- | ----------------------------------------------- |
| `different`      | Entrambi i lati hanno l'item, ma non concordano |
| `onlyLive`       | Solo la tabella ce l'ha                         |
| `onlyRepository` | Solo il file lo dichiara                        |
| `protectedItems` | Solo la tabella ce l'ha, **ed e' atteso**       |

L'ultima non c'e' nel riferimento. Tre tabelle dichiarano un `protectedKey` —
item che vivono in tabella di proposito e che nessun file dichiara, come
`cxId = pn-cons-000` in `pn-EcAnagrafica`. Contarli come drift significa
riportare lo stesso falso positivo a ogni esecuzione.

### Due difetti del riferimento non portati

- **La chiave non e' per forza una stringa.** Il riferimento confronta
  `localItem[key].S == item[key].S`: su un attributo di chiave non stringa i due
  lati valgono `undefined`, e `undefined == undefined` e' vero, quindi ogni item
  combacia col primo candidato; su un attributo assente solleva a meta' run.
  Oggi tutte e sedici le tabelle hanno chiavi `S`, quindi e' latente — ed e'
  esattamente perche' conviene chiuderlo adesso.
- **Il confronto era quadratico.** Il riferimento annida una `find` dentro una
  `forEach`, nei due versi: su `pn-addressManager-Cap`, che ha 4.714 item, sono
  circa 44 milioni di confronti per una tabella sola. Qui l'indice e' una mappa.

## Com'e' fatta la scrittura

### Si scrive solo la drift, non tutto il file

Il riferimento riscrive **ogni riga del file** a ogni `sync`, drift o no: non ha
scelta, perche' `syncExecutor` non legge mai la tabella. Qui il confronto e'
gia' stato fatto, quindi si scrivono solo gli item che differiscono — su
`pn-addressManager-Cap` e' la differenza fra una richiesta e 4.714 item ri-messi.

### Due modi di scrivere, uno per tabella

| `syncMode`          | Comando          | Effetto                                       |
| ------------------- | ---------------- | --------------------------------------------- |
| `replace` (default) | `BatchWriteItem` | Sostituisce l'item intero                     |
| `merge`             | `UpdateItem`     | Imposta solo gli attributi che il file nomina |

Il riferimento chiama il secondo `SyncMode: "UPDATE"` e lo da' a **una sola**
tabella, `pn-AuthJwtIssuers`. Leggerlo come un dettaglio e far passare tutte le
tabelle da un replace cancellerebbe in silenzio gli attributi che il suo file
non porta. Un test verifica che la mappa resti in passo col riferimento.

### Gli attributi che una scrittura cancellerebbe

Un `PutRequest` sostituisce l'item intero, quindi un attributo che la tabella
viva ha e il file no **sparisce senza comparire in nessun diff di item**. Prima
di scrivere, il piano elenca quegli attributi per ogni item.

Non e' teorico: in `test/_conf/confinfo/dynamodb/pn-EcAnagrafica.json` lo stesso
attributo e' scritto `SESEventsList` su un item e `sesEventsList` su un altro, e
la tabella viva usa il secondo. Applicare quel file rinominerebbe l'attributo su
`pn-test`. Vedi `docs/OPEN-FINDINGS.md` §4.1.

### Un file non puo' dichiarare un item protetto

Il verso opposto del `protectedKey`: se un file dichiara `pn-cons-000`, la
tabella esce `protected-in-file` e **la run non scrive niente**, nemmeno sulle
altre tabelle. Il riferimento lo controlla nel comando `validate`, che `sync`
esegue e `compare` non esegue mai.

### `UnprocessedItems` non viene ignorato

DynamoDB risponde a un batch throttlato con HTTP 200 e gli item rifiutati nel
corpo. Il riferimento non legge quel campo e stampa comunque
`Batch from 0 to 25 inserted successfully.`: un batch scritto a meta' risulta un
successo pieno. Qui gli item rifiutati vengono ritentati con backoff e quelli
che restano sono **riportati**, con exit code 1.

## Configurazione

### Parametri CLI

| Parametro         | Alias   | Obbl. | Default      | Descrizione                                             |
| ----------------- | ------- | :---: | ------------ | ------------------------------------------------------- |
| `--config-path`   | `--cp`  |  si   | —            | Checkout locale di `pn-configuration`                   |
| `--env`           | `--ev`  |  si   | —            | `test` \| `uat` \| `hotfix`                             |
| `--aws-profiles`  | `--aps` |  si   | —            | Profili SSO dei **due** account, separati da virgola    |
| `--aws-region`    | `--ar`  |  no   | `eu-south-1` | Regione delle tabelle                                   |
| `--table-names`   | `--tn`  |  no   | tutte        | Restringe la run a queste tabelle                       |
| `--sync`          | `--sy`  |  no   | `false`      | Scrive la drift su DynamoDB. Spento per default         |
| `--yes`           | —       |  no   | `false`      | Salta la conferma che copre tutte le scritture          |
| `--output-file`   | `--of`  |  no   | —            | Report: e' l'unico posto con **tutti** gli item diversi |
| `--output-format` | `--ofm` |  no   | `json`       | Formato del report                                      |

### Parametri del gruppo `Resources`

Arrivano da `configs/config.json` e si passano a riga di comando solo per
sovrascriverne uno. Non hanno alias: un alias viene risolto contro tutti i
provider, e `GOEnvironmentConfigProvider` carica l'intero `process.env`.

| Parametro                      | Descrizione                                                |
| ------------------------------ | ---------------------------------------------------------- |
| `--accounts-core`              | Frammento di nome profilo che marca l'account core         |
| `--accounts-confinfo`          | Frammento di nome profilo che marca l'account confinfo     |
| `--configuration-conf-dir`     | Directory di configurazione per account dentro un ambiente |
| `--configuration-dynamodb-dir` | Directory dei file di tabella dentro un account            |
| `--configuration-tables-file`  | File che dichiara tabelle, account e schema di chiave      |
| `--environments-allowed`       | Ambienti accettati da questo script                        |
| `--guard-prod-profile-markers` | Frammenti che marcano un profilo come di produzione        |

### `configs/tables.json`

La mappa delle tabelle: per ognuna l'account che la possiede, lo schema di
chiave, l'eventuale `protectedKey` e l'eventuale `syncMode`. E' **dati e non
codice** perche' sono nomi di risorse, e nessuno dei due e' deducibile dal path
del file. Oggi dichiara 16 tabelle, 9 su core e 7 su confinfo, 7 con chiave
composita e 1 in `merge`.

## Produzione: un rifiuto che nessun parametro scavalca

Le azioni che scrivono sono **rifiutate** su un account di produzione, prima di qualunque
scrittura, e `--yes` non lo aggira. I rilasci in produzione appartengono a un altro team: per
questo qui non c'e' la doppia conferma digitata degli altri writer, ma un rifiuto.

Un profilo e' di produzione se vale **uno qualunque** di questi segnali:

- il nome contiene, come token, `prod`, `prd` o `production` (`isProductionIdentifier` di go-script);
- l'account a cui risolvono le sue credenziali e' uno di `GO_PRODUCTION_ACCOUNT_IDS` in go-script
  (SEND core, SEND confinfo, INTEROP, INTEROP safe-storage e
  Watchtower, tutti prod), quindi anche un profilo chiamato senza marker;
- il nome contiene uno dei `guard.prodProfileMarkers` (`--gpm`).

I primi due sono la base e **non sono configurabili**: `guard.prodProfileMarkers` puo' solo
aggiungere marker, non toglierli. Fino al 2026-10-09 un `--gpm` che non combaciava con nessun
profilo disattivava il rifiuto; l'audit di quel giorno lo ha chiuso (`docs/OPEN-FINDINGS.md` §8).
La lista degli account e' l'unica eccezione deliberata alla regola sui nomi di risorsa nel
codice: una soglia di sicurezza non deve dipendere dalla configurazione.

Il confronto resta permesso anche su produzione, che e' il riferimento: e' una lettura. E'
`--sync` a essere rifiutato, sia con `--env` di produzione sia con un profilo di produzione, e
`environments.allowed` non lo cambia.

## Prerequisiti

- Login SSO su **entrambi** gli account dell'ambiente: ogni tabella viene
  instradata verso quello che la possiede, e una lettura sull'account sbagliato
  non risponde diversamente, fallisce.
- Un checkout di `pn-configuration` sul branch da confrontare.

## Utilizzo

### Esempi d'uso

Ogni caso e' dato nelle **due forme equivalenti**: `pnpm go` dalla root del monorepo, e il wrapper `go-cli` dove e' installato.

**1. Il confronto completo di un ambiente**

Sola lettura, ed e' il modo normale di usarlo: 16 tabelle, repository contro Parameter Store vivo, in entrambi i versi.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test
```

**2. Una tabella sola, quando si sta guardando una differenza precisa**

`--table-names` restringe il confronto. Su una run ristretta i file non configurati non vengono cercati, perche' sarebbero tutti non configurati per costruzione.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --tn pn-EcAnagrafica
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --tn pn-EcAnagrafica
```

**3. Cosa scriverebbe un sync, senza scriverlo**

Viene pianificata **solo la drift**, non ogni riga del file. E gli attributi che un replace cancellerebbe sono elencati **prima** della domanda: un `PutRequest` sostituisce l'item intero, e un attributo che la tabella ha e il file no sparirebbe senza comparire in nessun diff di item.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync --dry-run
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync --dry-run
```

**4. Il sync vero**

Niente viene mai cancellato: gli item che vivono in tabella e che nessun file dichiara sono riportati e lasciati stare.

```bash
pnpm go send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync
go-cli  send-sync-anagrafica --cp ~/workspaces/pagopa/send/pn-configuration --ev test --aps send-core-test,send-confinfo-test --sync
```

**5. Far fallire la run quando manca un file, o ne avanza uno**

Due tabelle sono dichiarate e non hanno file in **nessuno** dei cinque alberi, quindi di default quelle righe sono riportate ma non fanno fallire. `--strict-configuration` e' per chi sa che non dovrebbero esserci.

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

**La drift non e' un fallimento**: e' la risposta che si era chiesta, quindi
esce `0`. Esce `1` quando la run non ha potuto rispondere — una scan rifiutata,
un file che non si parsa, una tabella dichiarata senza file (`missing-file`),
un file che la mappa non dichiara (`unconfigured`), un file che dichiara un item
protetto (`protected-in-file`). Con `--sync`, esce `1` anche se una scrittura
non e' andata a segno.

Il cancello davanti alle scritture e' **per tabella**: una tabella che non si e'
potuta leggere non viene mai pianificata, perche' solo una `drifted` lo e'.
Quindi `--sync` scrive le tabelle che hanno risposto e lascia stare le altre,
dicendo nella domanda di conferma quante non hanno risposto. Su `test` sono due
(`pn-AuthJwtIssuers` e `pn-AuthJwtAttributes`, senza file): rifiutare tutta la
run per questo renderebbe `--sync` inutilizzabile li' senza proteggere niente.

L'unica eccezione e' `protected-in-file`, che rifiuta **l'intera run**: le altre
tabelle si scrivono a partire dallo stesso repository, e un file che dichiara un
item di proprieta' dell'ambiente dice che quell'insieme di file non e'
affidabile in blocco.

Su `test` oggi `pn-AuthJwtIssuers` e `pn-AuthJwtAttributes` sono dichiarate
nella mappa e non hanno file: la run esce `1` per questo, ed e' corretto.
