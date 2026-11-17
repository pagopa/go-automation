# Account AWS logici: perché, come sono fatti, come funzionano

> Questo documento spiega come i runbook leggono **più account AWS** senza scrivere nel codice gli identificativi degli account o i nomi dei profili. Chi scrive runbook trova i dettagli tecnici in [RUNBOOKENGINE.md §7.1](RUNBOOKENGINE.md#71-account-ambienti-e-permessi).
>
> Tutti gli identificativi di account in questo documento sono **finti**.

## Indice

1. [In breve](#1-in-breve)
2. [Parole usate](#2-parole-usate)
3. [Da dove siamo partiti: i problemi](#3-da-dove-siamo-partiti-i-problemi)
4. [Le regole che abbiamo scelto](#4-le-regole-che-abbiamo-scelto)
5. [Come è fatto il modello](#5-come-è-fatto-il-modello)
6. [I parametri](#6-i-parametri)
7. [Cosa succede quando si esegue un runbook](#7-cosa-succede-quando-si-esegue-un-runbook)
8. [I due modi di accedere agli account](#8-i-due-modi-di-accedere-agli-account)
9. [Gli errori](#9-gli-errori)
10. [Dove si configura](#10-dove-si-configura)
11. [Riservatezza, risultati e cache](#11-riservatezza-risultati-e-cache)
12. [Il controllo sui package pubblicati](#12-il-controllo-sui-package-pubblicati)
13. [Le alternative che abbiamo scartato](#13-le-alternative-che-abbiamo-scartato)
14. [Esempi pratici](#14-esempi-pratici)

---

## 1. In breve

- Il codice di un runbook **non contiene** identificativi di account, ambienti o nomi di profilo. Contiene solo dei **nomi logici** di account, come `send/core` e `send/confinfo`.
- Chi esegue il runbook fornisce tre informazioni:
  - **la rubrica** (`aws.account.directory`): per ogni nome logico e per ogni ambiente, l'identificativo dell'account. Per esempio `send/core/prod=000000000101`;
  - **il modo di accesso** (`aws.account.binding`): con i profili locali (`profiles`) oppure dall'account di monitoraggio (`oam`);
  - **l'ambiente** (`aws.account.environment`), ma solo quando non lo si può ricavare dall'allarme.
- Prima di eseguire il primo step, il sistema:
  1. capisce l'ambiente;
  2. controlla che la configurazione sia completa e corretta;
  3. prepara per ogni step l'accesso all'account giusto, e solo a quello.
- Un controllo automatico impedisce che identificativi di account o nomi di profilo finiscano nei package pubblicati `@pagopa/*`.

## 2. Parole usate

| Parola             | Significato                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Account id**     | Il numero di 12 cifre che identifica un account AWS.                                                                                       |
| **Profilo**        | Una voce del file `~/.aws/config` di chi lavora in locale. Il nome lo sceglie la persona, ed è diverso da macchina a macchina.             |
| **Account logico** | Un nome stabile per un account, scritto nel codice: `<prodotto>/<account>`, per esempio `send/core`. Non dice di quale ambiente si tratta. |
| **Ambiente**       | `prod`, `uat`, `dev`, … Lo stesso account logico corrisponde a un account diverso in ogni ambiente.                                        |
| **Rubrica**        | L'elenco che collega ogni account logico, in ogni ambiente, al suo account id.                                                             |
| **Occorrenza**     | Un singolo scatto di un allarme. Contiene l'account e la regione in cui è scattato.                                                        |
| **Permission set** | Il tipo di permesso di un accesso SSO, per esempio sola lettura o amministrazione.                                                         |
| **OAM**            | Observability Access Manager di AWS: permette all'account di monitoraggio di leggere i log degli altri account collegati.                  |
| **STS**            | Il servizio AWS che, dato un profilo, dice a quale account appartiene e con quale permesso.                                                |

## 3. Da dove siamo partiti: i problemi

Tre runbook SEND leggono account diversi da quello in cui scatta l'allarme:

- `pn-downstream-monitoring-lambda-LogInvocationErrors-Alarm` legge **core e confinfo**;
- `pn-logsaver-be-FailedInvocation-Alarm` legge core e confinfo;
- `spidhub-prod-ExternalELBAlarm` legge confinfo.

Prima lo facevano in un modo che creava questi problemi:

1. **Gli account id di produzione erano scritti nel codice.** `@pagopa/go-runbook` viene pubblicato su GitHub Packages, quindi quegli identificativi sarebbero diventati visibili fuori dal team. Sono un'informazione utile a chi vuole attaccare.
2. **Il profilo veniva scelto per nome.** Ma il nome di un profilo lo decide ogni persona: su un'altra macchina lo stesso profilo ha un altro nome, e il runbook non funziona. In più il nome rivela come è organizzato il team.
3. **L'ambiente era implicito.** Nel codice c'erano solo gli account di produzione: un allarme di uat veniva rifiutato, e in locale si leggeva sempre la produzione. Eppure la stessa Lambda gestisce allarmi di più ambienti.
4. **Il permesso non era il minimo necessario.** Una persona può avere sullo stesso account più permessi (lettura, operazioni, amministrazione). Veniva usato il primo profilo dell'elenco, qualunque permesso avesse.
5. **Nessuno controllava cosa veniva pubblicato.** README, CHANGELOG, `package.json` e mappe del codice vengono pubblicati insieme al codice.
6. **La Lambda non sapeva dove leggere.** Nessuna configurazione le indicava quali account corrispondono a quali nomi logici.

## 4. Le regole che abbiamo scelto

1. **Nessun dato sensibile nei package pubblicati.** Nessun account id, nessun ARN che contiene un account, nessun nome di profilo nei file pubblicati di `@pagopa/go-common`, `@pagopa/go-aws` e `@pagopa/go-runbook`. Lo verifica un controllo automatico (§12).
2. **Il nome del profilo non conta.** Conta l'account a cui il profilo appartiene, e lo si chiede a STS.
3. **Lo stesso runbook funziona ovunque**: in locale con i profili, in locale con l'account di monitoraggio, nella Lambda, e in ogni ambiente.
4. **Se manca qualcosa, ci si ferma subito.** L'errore arriva prima di leggere qualsiasi log, e dice cosa manca.
5. **Si legge solo l'account giusto.** Se un dato non c'è, non si prova a cercarlo in un altro account.
6. **Si preferisce il permesso più basso**, se lo si configura.
7. **Si estende senza toccare il codice.** Un nuovo ambiente si aggiunge con nuove righe nella rubrica.

> **Un limite.** Questa soluzione riguarda solo la scelta dell'account. I nomi degli allarmi, dei gruppi di log e delle altre risorse che cambiano da un ambiente all'altro restano scritti nel runbook. Per esempio spidhub vale solo in produzione, e lo dichiara in modo esplicito (§5.4).

## 5. Come è fatto il modello

### 5.1 Account logico

- **Forma:** `<prodotto>/<account>`, in minuscolo, con lettere, cifre e trattini. Esempi: `send/core`, `send/confinfo`.
- **Cosa non contiene:** né l'ambiente né il permesso. È un nome stabile e non sensibile.
- **Nel codice:** si crea con `parseAwsLogicalAccount('send/core')`, che ne controlla la forma. Ogni prodotto dichiara i propri account logici; per SEND:

  ```ts
  SEND_ACCOUNTS = { core: 'send/core', confinfo: 'send/confinfo' };
  ```

  È l'**unica** informazione sugli account che resta nel codice.

### 5.2 Ambiente

- **Forma:** lettere minuscole, cifre e trattini. Nel codice non c'è un elenco fisso, perché ogni prodotto ha i suoi ambienti: per SEND `dev`, `test`, `uat`, `hotfix` e `prod`; per INTEROP `dev`, `test`, `attestazione`, `vapt` e `prod`.
- **Da dove arriva:**
  - **se c'è un'occorrenza**, dalla rubrica: è l'ambiente della riga che contiene l'account dell'occorrenza;
  - **se non c'è**, dalla configurazione: `aws.account.environment`.
- Vale per tutta l'esecuzione.

### 5.3 Rubrica

Ogni riga ha questa forma:

```text
<prodotto>/<account>/<ambiente>=<account id>
```

Esempio con identificativi finti:

```text
send/core/prod=000000000101
send/confinfo/prod=000000000102
send/core/uat=000000000201
send/confinfo/uat=000000000202
```

Quando la rubrica viene letta, si controlla che:

- ogni riga abbia la forma giusta e un account id di 12 cifre;
- la stessa coppia (account logico, ambiente) non compaia due volte;
- **un account id compaia in un solo ambiente.** Può comparire sotto più nomi logici, ma sempre nello stesso ambiente. Questa regola è indispensabile: se lo stesso account fosse sia in uat sia in prod, dall'allarme non si potrebbe capire l'ambiente.

La rubrica **non contiene** né profili né regioni:

- il profilo lo sceglie il sistema (§8);
- la regione è quella in cui si esegue: `aws.region` in locale, quella della Lambda nel cloud. Le letture su più regioni nella stessa esecuzione non sono previste.

### 5.4 Selezione: cosa legge uno step

Uno step che legge altri account dichiara una **selezione**:

```ts
interface AwsAccountSelection {
  readonly subject: string; // nome usato nei messaggi
  readonly accounts: ReadonlyArray<AwsLogicalAccount>; // account da leggere, in ordine
  readonly scope: 'every-account' | 'occurrence-account';
  readonly environments?: ReadonlyArray<string>; // facoltativo: ambienti ammessi
}
```

- **`every-account`:** legge tutti gli account elencati, nell'ambiente dell'esecuzione. Lo usa downstream-monitoring, che legge core e confinfo.
- **`occurrence-account`:** se c'è un'occorrenza, legge solo il suo account; altrimenti li legge tutti. Lo usa logsaver.
- **Allarme estraneo:** se l'account dell'occorrenza non è tra quelli elencati, l'esecuzione viene rifiutata, in entrambi i casi.
- **`environments`:** limita gli ambienti in cui lo step può leggere.
  - spidhub dichiara `['prod']`, e anche logsaver, per mantenere il comportamento di prima;
  - è una regola del runbook e non dipende da cosa c'è nella rubrica, che è comune a tutti i runbook.
- **Nomi doppi:** due nomi logici della stessa selezione non possono indicare lo stesso account, altrimenti lo stesso account verrebbe letto e contato due volte.

## 6. I parametri

| Parametro                     | Variabile d'ambiente          | Opzione da riga di comando      | Valore             | Quando serve                           |
| ----------------------------- | ----------------------------- | ------------------------------- | ------------------ | -------------------------------------- |
| `aws.account.directory`       | `AWS_ACCOUNT_DIRECTORY`       | `--aws-account-directory`       | elenco di righe    | se il runbook usa account logici       |
| `aws.account.binding`         | `AWS_ACCOUNT_BINDING`         | `--aws-account-binding`         | `profiles` o `oam` | facoltativo: c'è un valore predefinito |
| `aws.account.environment`     | `AWS_ACCOUNT_ENVIRONMENT`     | `--aws-account-environment`     | un ambiente        | solo in go-analyze-alarm               |
| `aws.account.permission.sets` | `AWS_ACCOUNT_PERMISSION_SETS` | `--aws-account-permission-sets` | elenco             | facoltativo                            |

Nelle variabili d'ambiente gli elementi di un elenco si separano con la virgola.

Un runbook che **non** usa account logici non richiede nessuno di questi parametri. Oggi è il caso di tutti, tranne tre.

### 6.1 `aws.account.directory`: la rubrica

- **Che cos'è:** l'elenco delle righe `<prodotto>/<account>/<ambiente>=<id>` (§5.3).
- **Perché sta nella configurazione e non nel codice:** è l'unico posto in cui gli identificativi possono stare senza essere pubblicati. La configurazione resta sulla macchina di chi esegue, oppure nell'ambiente della Lambda.
- **Cosa scriverci:** le righe degli account usati dai runbook che si eseguono, negli ambienti in cui si eseguono. Una rubrica con tutti gli ambienti va bene per tutti.
- **Esempio:** `scripts/go/go-analyze-alarm/configs/aws-accounts.example.env`, con identificativi finti. Va copiato **fuori dal repository** e completato con gli identificativi veri.

### 6.2 `aws.account.environment`: l'ambiente, quando l'allarme non lo dice

- **Chi lo usa:** solo **go-analyze-alarm**. Questo script analizza un allarme partendo dal nome e dall'orario, e non conosce l'account in cui è scattato. Senza questo parametro non saprebbe se leggere prod o uat.
- **Chi non lo usa:** go-execute-runbook (compresa la Lambda) e go-rta-check partono sempre da un'occorrenza che contiene il suo account, quindi ricavano l'ambiente dalla rubrica. Per loro questo parametro non esiste.
- **Perché non lo si indica sempre:** se l'ambiente venisse sempre dalla configurazione, la stessa Lambda non potrebbe gestire allarmi di ambienti diversi, e una configurazione sbagliata farebbe leggere l'ambiente sbagliato. Ricavarlo dall'allarme è più sicuro.

### 6.3 `aws.account.binding`: il modo di accedere

- **`profiles`:** si usano i profili locali indicati con `--aws-profiles`. Per ogni account da leggere, il sistema chiede a STS a quale account appartiene ogni profilo e sceglie quello giusto (§8.1). Il nome del profilo non conta.
- **`oam`:** si legge dall'account di monitoraggio, attraverso il collegamento OAM, indicando l'account preciso (§8.2).
- **Valore predefinito**, se il parametro manca:

  | Dove                            | Valore predefinito                                          |
  | ------------------------------- | ----------------------------------------------------------- |
  | go-analyze-alarm                | `profiles`                                                  |
  | go-rta-check                    | `profiles`                                                  |
  | go-execute-runbook in locale    | `profiles` se ci sono profili configurati, altrimenti `oam` |
  | go-execute-runbook nella Lambda | sempre `oam`, anche se si configura un altro valore         |

- **Perché è un parametro esplicito:** prima go-execute-runbook sceglieva il modo di accesso solo in base alla presenza di profili. Ora la regola è scritta ed è uguale per tutti gli script. Nella Lambda non si può cambiare.

### 6.4 `aws.account.permission.sets`: il permesso preferito

- **Che cos'è:** un elenco di permission set, in ordine di preferenza. Per esempio `ReadOnlyAccess`.
- **Quando conta:** solo con `profiles`, e solo quando **più profili** raggiungono lo stesso account.
- **Come funziona:** il permission set di un profilo si legge nell'ARN che STS restituisce (`…:assumed-role/AWSReservedSSO_<PermissionSet>_<codice>/…`). Prima vengono i profili con un permission set dell'elenco, nell'ordine dell'elenco; poi tutti gli altri, nell'ordine in cui sono configurati.
- **È una preferenza, non un obbligo** (decisione D6). Se nessun profilo ha un permission set dell'elenco, si usa comunque un profilo che raggiunge l'account.

## 7. Cosa succede quando si esegue un runbook

```text
configurazione: rubrica, modo di accesso, [ambiente], [permission set]
        │
        ▼
1. preparazione dei servizi ── rubrica scritta male? → errore (§9.2)
        │
        ▼
2. controllo iniziale, prima del primo step
   a. raccoglie le selezioni di tutti gli step, anche di quelli annidati
      └─ nessuna selezione? → fine: il runbook non usa account logici
   b. capisce l'ambiente: dall'occorrenza, oppure da aws.account.environment
   c. se c'è un'occorrenza, controlla che la sua regione sia quella dell'esecuzione
   d. per ogni selezione calcola quali account leggere
   e. controlla: allarme estraneo, ambiente non ammesso, riga mancante, nomi doppi
   f. prepara l'accesso agli account (con profiles interroga STS), senza leggere log
        │
        ▼
3. esecuzione degli step: ogni step usa l'accesso già pronto al suo account
        │
        ▼
4. risultato: details.awsAccounts riporta gli account usati
   (nome logico, ambiente, account id, regione)
```

**Un esempio.** Scatta un allarme di `pn-downstream-monitoring-lambda` nell'account `000000000201`.

1. Nella rubrica, `000000000201` è `send/core/uat`: l'ambiente è `uat`.
2. Lo step dichiara `every-account` su `send/core` e `send/confinfo`.
3. Il sistema trova `send/core/uat=000000000201` e `send/confinfo/uat=000000000202`.
4. Prepara l'accesso a entrambi gli account, e lo step li legge.

Prima, questo allarme sarebbe stato rifiutato, perché nel codice c'erano solo gli account di produzione.

## 8. I due modi di accedere agli account

### 8.1 `profiles`

Per ogni account da leggere il sistema:

1. trova l'account id nella rubrica, per l'ambiente dell'esecuzione;
2. chiede a STS a quale account appartiene ogni profilo configurato. Usa **tutti** i profili configurati, perché l'account da leggere può essere diverso da quello dell'allarme;
3. tiene solo i profili di quell'account e della regione dell'esecuzione;
4. se ne restano più di uno, li ordina in base al permesso preferito (§6.4);
5. prepara l'accesso con il solo profilo scelto, legato a quell'account preciso.

Se un gruppo di log non esiste, **non** si prova con un altro profilo. Altrimenti potrebbero arrivare righe dell'account core presentate come righe di confinfo: dati sbagliati che sembrano giusti.

Se nessun profilo raggiunge l'account, l'esecuzione si ferma con `AWS_ACCOUNT_UNREACHABLE` (§9). I profili provati vengono scritti solo nel log locale.

### 8.2 `oam`

- Non interroga STS. Legge dall'**account di monitoraggio** l'account preciso (account id e regione), attraverso il collegamento OAM, senza tentativi su altri account.
- **Le credenziali:** in locale, un profilo qualsiasi dell'account di monitoraggio; nel cloud, quelle della Lambda.
- I permission set non contano.
- **Condizione:** ogni account della rubrica usata nel cloud deve essere collegato all'account di monitoraggio. Lo controlla il deploy (§10.2).

## 9. Gli errori

### 9.1 Errori del controllo iniziale

Sono tutti `AwsAccountError` con un `code` fisso. Il messaggio dice quale account logico, quale ambiente e quale parametro sono coinvolti.

| `code`                                   | Quando succede                                                                                        | Cosa fare                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `AWS_ACCOUNT_NOT_CONFIGURED`             | manca la riga `<prodotto>/<account>/<ambiente>` nella rubrica                                         | aggiungere la riga ad `aws.account.directory`              |
| `AWS_ACCOUNT_ENVIRONMENT_NOT_CONFIGURED` | non c'è un'occorrenza e manca l'ambiente                                                              | impostare `aws.account.environment`                        |
| `AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED`    | il runbook non vale in quell'ambiente (per esempio spidhub fuori dalla produzione)                    | niente: è il comportamento previsto                        |
| `AWS_OCCURRENCE_ACCOUNT_MISMATCH`        | l'account dell'allarme non è nella rubrica o non è tra quelli dello step, oppure la regione è diversa | controllare la rubrica o l'allarme                         |
| `AWS_ACCOUNT_SELECTION_AMBIGUOUS`        | due nomi logici della stessa selezione indicano lo stesso account                                     | correggere la rubrica                                      |
| `AWS_ACCOUNT_UNREACHABLE`                | nessuna credenziale raggiunge l'account nella regione dell'esecuzione                                 | aggiungere un profilo di quell'account, oppure usare `oam` |
| `AWS_ACCOUNT_DIRECTORY_INVALID`          | solo nella Lambda: rubrica o modo di accesso non validi (§9.2)                                        | correggere la configurazione della Lambda                  |

Gli errori temporanei (STS non risponde, problemi di rete, troppe richieste) **non** sono errori di configurazione: nella Lambda l'analisi viene ritentata.

### 9.2 Rubrica scritta male

Una riga nella forma sbagliata, una riga ripetuta, un account in due ambienti o un modo di accesso sconosciuto vengono scoperti mentre si preparano i servizi, prima di eseguire il runbook:

- **go-analyze-alarm e go-rta-check** si fermano subito, all'avvio, con un errore.
- **go-execute-runbook e la Lambda non si fermano.** I runbook che non usano account logici continuano a funzionare. Solo quelli che li usano falliscono, prima del primo step, con `AWS_ACCOUNT_DIRECTORY_INVALID`. Così un errore di configurazione non blocca tutte le analisi.

### 9.3 Come la Lambda chiude l'analisi in Watchtower

Un `AwsAccountError` chiude il tentativo in corso con un esito definitivo, senza riprovare. Si usano le categorie che il contratto con Watchtower già prevede:

- **allarme estraneo o ambiente non ammesso:** `CAPABILITY` / `RUNBOOK_CAPABILITY_MISMATCH`, cioè il runbook non è adatto a quell'allarme;
- **tutti gli altri casi:** `WORKER_CONFIGURATION` / `WORKER_CONFIGURATION_ERROR`, cioè va corretta la configurazione.

Il messaggio comincia con il codice, per esempio `[AWS_ACCOUNT_NOT_CONFIGURED] …`. Il contratto con Watchtower non cambia.

## 10. Dove si configura

### 10.1 In locale, negli script

| Script             | Parametri                                                | Ambiente                             |
| ------------------ | -------------------------------------------------------- | ------------------------------------ |
| go-analyze-alarm   | `directory`, `binding`, `environment`, `permission.sets` | da `aws.account.environment`         |
| go-execute-runbook | `directory`, `binding`, `permission.sets`                | dall'occorrenza                      |
| go-rta-check       | `directory`, `binding`, `permission.sets`                | dall'occorrenza, per ogni occorrenza |

I valori vanno nel file di configurazione dello script o nelle variabili d'ambiente di chi esegue, **mai** nel codice. Il file d'esempio, con identificativi finti, mostra il formato: va copiato fuori dal repository e completato con quelli veri.

### 10.2 Nel cloud, nella Lambda go-ExecuteRunbookLambda

- La rubrica arriva dalla variabile di deploy `EXECUTE_RUNBOOK_ACCOUNT_DIRECTORY`, che è facoltativa.
- `DeploymentConfig` la controlla **durante il deploy**:
  - con le stesse regole della rubrica: forma delle righe, righe ripetute, un account in un solo ambiente;
  - rifiutando ogni account non collegato all'account di monitoraggio (`OAM_SOURCE_ACCOUNT_IDS`).

  Così un errore si scopre al deploy, non alla prima analisi.

- `sst.config.ts` passa alla Lambda `AWS_ACCOUNT_DIRECTORY` e `AWS_ACCOUNT_BINDING=oam`.

## 11. Riservatezza, risultati e cache

- **Risultati e tracce** usano il nome logico dell'account, per esempio `sourceAccount: 'core'`. L'account id compare solo se viene preso dalla rubrica durante l'esecuzione:
  - in `details.awsAccounts`;
  - nel testo di un caso noto, tramite una variabile riempita dallo step (`{{vars.spidHubAccountId}}`).
- **I metadati scritti nel codice** dei runbook non contengono più né account né regione.
- **I nomi dei profili non escono dalla macchina.** Prima di finire nel risultato, i messaggi di errore vengono ripuliti:
  - si tolgono i riferimenti ai profili, come `(profile: x)`, `profile: [x]`, `profile 'x'` e gli elenchi `Configured profiles: …`;
  - gli errori sulle credenziali di AWS (MFA richiesta, profili che si richiamano a vicenda, accesso SSO scaduto, metadati dell'istanza non raggiungibili) diventano `[<nome dell'errore>] AWS credentials could not be resolved`;
  - il testo originale finisce solo nei log locali.

  La pulizia non cambia le parole del messaggio: un profilo che si chiama `access` non può nascondere un `access denied`.

- **Cache di go-rta-check.** La chiave della cache tiene conto del modo di accesso, dell'ambiente, delle righe di rubrica usate, dei permessi preferiti e dei profili configurati: se la rubrica cambia, il risultato vecchio non viene riusato. Inoltre non si salvano in cache i fallimenti che dipendono dalle credenziali o dalla rubrica (accesso negato, credenziali non trovate, errori `AWS_ACCOUNT_*`): con credenziali diverse, il tentativo successivo deve poter riuscire.

## 12. Il controllo sui package pubblicati

Tre controlli automatici impediscono di ricadere nello stesso errore:

| Controllo | Comando                        | Cosa verifica                                                                                                                         |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| G-pub-1   | `pnpm check:published` (in CI) | crea il pacchetto di ogni `@pagopa/*` con `pnpm pack` e controlla **ogni file** che verrebbe pubblicato, più l'elenco dei file stessi |
| G-pub-2   | `pnpm check:published:sources` | fa lo stesso controllo sui sorgenti e sui README, senza compilare. Fa parte di `pnpm lint`                                            |
| G-pub-3   | ESLint                         | vieta i numeri di 12 cifre nel codice pubblicato                                                                                      |

- **Cosa cercano:** account id, ARN che contengono un account, nomi di profilo noti e nomi che iniziano con `sso_`.
- **Identificativi ammessi:** solo quelli finti, `000000000000` e `123456789012`.
- **Regole ed eccezioni:** stanno in `published-sensitive-data.config.json`. Ogni eccezione vale per un solo package, un solo file e un solo valore, e deve essere motivata per iscritto.
- **Nei log della CI** i valori trovati compaiono mascherati, per non ripubblicarli.

## 13. Le alternative che abbiamo scartato

| Alternativa                                                          | Perché no                                                                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scrivere gli account id nel codice (`SEND_CORE_PROD_ACCOUNT`)        | Verrebbero pubblicati su GitHub Packages. È proprio l'errore da cui siamo partiti.                                                                            |
| Scegliere il profilo per nome                                        | I nomi sono liberi e cambiano da una macchina all'altra.                                                                                                      |
| Prendere l'ambiente sempre dalla configurazione                      | La stessa Lambda gestisce più ambienti, e una configurazione sbagliata farebbe leggere l'ambiente sbagliato. L'allarme è la fonte più affidabile.             |
| Se un gruppo di log manca, riprovare con un altro profilo            | Restituirebbe dati di un altro account presentati come giusti.                                                                                                |
| Rendere obbligatorio il permission set                               | Bloccherebbe chi non ha quel permesso ma può comunque leggere. Per ora è una preferenza (D6); in futuro si può rendere obbligatorio.                          |
| Scrivere gli account logici nel descrittore del catalogo             | Cambierebbe il contratto con Watchtower. Il controllo si fa durante l'esecuzione, prima del primo step (D3).                                                  |
| Ripulire gli errori sostituendo i nomi dei profili ovunque compaiano | Un profilo chiamato `access` trasformava `access denied` in `<profile> denied`, e il fallimento finiva in cache. Si tolgono solo i riferimenti riconoscibili. |
| Togliere gli account id anche dai file che non vengono pubblicati    | Per ora non serve (D4): la regola riguarda solo ciò che viene pubblicato.                                                                                     |

## 14. Esempi pratici

### 14.1 Eseguire in locale un runbook che legge più account

```bash
export AWS_ACCOUNT_DIRECTORY=send/core/prod=000000000101,send/confinfo/prod=000000000102
export AWS_ACCOUNT_ENVIRONMENT=prod                  # solo per go-analyze-alarm
export AWS_ACCOUNT_PERMISSION_SETS=ReadOnlyAccess    # facoltativo
pnpm go:analyze:alarm:dev --aws-profiles <i-tuoi-profili> …
```

Al posto degli identificativi finti vanno quelli veri. I profili possono avere qualsiasi nome: basta che almeno uno raggiunga ogni account da leggere.

### 14.2 Aggiungere un ambiente

Si aggiungono le righe di quell'ambiente nella rubrica, per esempio `send/core/hotfix=…` e `send/confinfo/hotfix=…`. Il codice non cambia. Nel cloud, l'account deve essere anche collegato all'account di monitoraggio.

### 14.3 Aggiungere un account o un prodotto

1. Si dichiara il nuovo account logico nel toolkit del prodotto, per esempio `interop/main`.
2. Si aggiungono le sue righe nella rubrica, una per ambiente.

Non si tocca né il motore né il resto del sistema.

### 14.4 Scrivere uno step che legge altri account

Lo step:

- dichiara di usare il servizio `awsAccounts`;
- dichiara la sua selezione con `accountSelections()`;
- durante l'esecuzione ottiene gli account con `resolveAwsAccountSelection(context, selection)`;
- legge ciascuno con `context.services.awsAccounts.cloudWatchLogsFor(account)`.

L'esempio completo è in [RUNBOOKENGINE.md §7.1](RUNBOOKENGINE.md#71-account-ambienti-e-permessi). Lo strumento `create-runbook` rifiuta di generare un runbook che contiene un account id o un nome di profilo.

### 14.5 Scrivere i test

Si usa `InMemoryAwsAccountsPort` con una rubrica di identificativi finti, e lo si passa a `createTestServiceRegistry({ awsAccounts })`. Applica le stesse regole di rubrica e ambiente del sistema reale, ma legge i log da dati in memoria.
