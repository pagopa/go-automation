# SPEC-002 · Runbook Automation: tutti gli errori, in ordine di tempo — v10

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: la richiesta del committente del 19 novembre 2026
- Revisione: la v10 recepisce il nono giro di revisione di Codex sul modello ad albero. La v08 aveva cambiato l'asse
  della proposta. Al posto dell'«analisi per errore» delle versioni precedenti c'è
  l'**albero degli errori** chiesto dal committente il 19 novembre 2026: a ogni livello si raccolgono tutti gli
  errori, chi può scende al livello sotto, e l'output è l'elenco delle catene. Le regole decise nei sette giri di
  revisione restano, adattate al nuovo modello. Rilievi e decisioni sono nel registro.

## 1. Perché

### 1.1 Oggi conta un caso solo

Il motore valuta già **tutti** i casi noti e li raccoglie tutti (`RunbookEngine.evaluateKnownCasesCore`), ma poi li
ordina per `priority` decrescente e da lì in avanti conta solo il primo:

| Dove                                                        | Che cosa fa con il primo caso                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `RunbookEngine.execute`                                     | esegue solo l'azione di `matchedCases[0]`                                                                   |
| `buildRunbookOutput` / `RunbookOutcome`                     | `primaryCaseId`, `primaryCaseDescription`, messaggio «Individuato caso noto: \<primario\>»                  |
| `buildAnalysisDraft` (bozza per Watchtower)                 | `conclusionNotes`, `errorDetails`, `proposedStatus`, `analysisType`, `ignoreReason*` vengono dal primo caso |
| Reporter (`ApiGwServiceChainReporter`, `LambdaReporter`)    | «← primario», «eseguita solo l'action del caso primario»                                                    |
| `go-analyze-alarm`, `go-rta-check`, `go-watchtower-runbook` | stampano, salvano e confrontano con l'analisi umana il caso primario                                        |

Inoltre uno step che restituisce `next: 'resolve'` fa valutare i casi a metà pipeline e, se uno corrisponde,
**ferma la pipeline**. Lo fanno cinque step dei toolkit (authorizer ed execution log di API GW, analisi dei servizi
attraversati, analisi dei log applicativi, tracker dei CID interop) e cinque del catalogo SEND.

### 1.2 Interop guarda tutta la finestra, SEND segue un errore solo

**Interop** (k8s e API GW, 34 runbook). La query restituisce tutte le righe d'errore della finestra, e i casi sono
regex su tutte quelle righe (`stepEvidenceMatches`). Nei log applicativi interop il messaggio contiene già la causa:
non serve seguire la richiesta altrove. Tre errori diversi nella finestra sono tre casi riconosciuti. Restano limiti
che nessuno dichiara:

- aggregati con il solo `latestTimestamp`, ordinati per `count desc` prima del limite;
- CID scartati dal tracker (`SkippedCidCount`);
- oggetti derivati del BFF che perdono il tempo;
- il contesto del pod che lancia un errore sul limite di righe.

**SEND** (36 runbook nelle famiglie API GW, Lambda, service e downstream). Qui sintomo e causa stanno in posti
diversi, e i runbook sono costruiti come un'**indagine su un errore solo**.

- **API Gateway** (9 runbook):
  - l'access log dice «500 su questa richiesta», non il perché, e la query ordina per gravità con `limit 1000`;
  - `ParseApiGwErrorsStep` tiene **una sola riga**, la più grave, e la traversata segue i servizi a valle
    (`pn-delivery`, `pn-data-vault`, …) **con il suo solo trace id**;
  - per ogni servizio si salva **un solo messaggio**, il più lungo (`scanServiceLogs`);
  - gli step dell'authorizer e dell'execution log leggono tutto l'access log;
  - le righe senza requestId spariscono.
- **Lambda** (12 runbook):
  - una sola categoria per la finestra (`timeout` vince su tutto) e un messaggio rappresentativo;
  - la query ordina `desc`;
  - la ricostruzione dell'invocazione cerca il requestId anche nel testo dei messaggi;
  - la variante multi-account lancia un errore se una sorgente satura.
- **Service e downstream** (15 runbook): un messaggio rappresentativo, il più recente, e il primo trace id trovato.
  Un caso come `selfcarepg-read-timeout-with-empty-error` unisce i due, anche quando appartengono a errori diversi.
- **SPID Hub e Logsaver**: pipeline proprie a livello di finestra.

In SEND gli altri errori della finestra non vengono mai interrogati, quindi nessun caso può riconoscerli. La
priorità non c'è solo nei casi: c'è nella scelta della richiesta da seguire (la più grave) e del messaggio per
servizio (il più lungo).

### 1.3 La priorità porta significati che nessuno dichiara

Nel catalogo ci sono **302 valori di `priority`** su 72 runbook, più 4 nei casi condivisi dei toolkit. Oltre
all'ordine, il numero codifica regole implicite:

- **fasce**: in `pn-delivery-B2B-ApiGwAlarm` i casi da lavorare stanno nella fascia 500 e quelli chiudibili nella
  200, «so a benign overlap can never hide work still required»;
- **specifico sopra generico**: i casi «500 senza log applicativi correlati»; in Workday `duplicated-event-400-02`
  contiene `duplicated-event-err-cons`;
- **sostituzione di un caso condiviso**: il timeout di `pn-delivery-insert-trigger-eb-lambda` ha la stessa
  condizione di `lambda-timeout` e priorità più alta;
- **casi che vincono su tutto**: i due dell'authorizer (10.000 e 9.999);
- **univocità imposta** da `DUPLICATE_CASE_PRIORITY`.

### 1.4 Il tempo e la completezza non sono dati del motore

- Il motore non ha un campo "quando". `pattern` si ferma alla prima riga, `contains` conserva nella traccia solo 10
  righe.
- Le query ordinano in modi diversi, e con `limit` gli errori più vecchi o più rari possono non arrivare.
- Con la paginazione disattivata, il lettore CloudWatch scarta `nextToken`.
- Alcuni step dicono «tutto bene» senza aver guardato niente:
  - `QueryServiceLogsStep` senza trace id restituisce zero righe, e un caso «504 senza log in `pn-delivery`» chiude
    senza aver interrogato `pn-delivery`;
  - gli hook di Stream e la sonda B2B restituiscono successo su una lettura fallita.

## 2. Che cosa vede chi usa il repository

**Chi analizza un allarme** vede un elenco di **catene**, dalla più vecchia alla più recente:

```
Trovati gli errori noti:
- 10:01 A: timeout dell'authorizer (3 volte, fino alle 10:07)
- 10:02 B: 500 POST /delivery → C: ArrayIndexOutOfBounds in pn-delivery
- 10:04 B: 500 POST /delivery → D: errore data-vault in pn-delivery → E: SelfcarePG 500 (12 volte, fino alle 10:20)
- 10:05 500 POST /attachments → ? (errore non riconosciuto in pn-data-vault)
- 10:09 500 GET /notifications → (pn-delivery non interrogato: trace id mancante)
```

Ogni catena parte da un errore della radice e scende finché c'è un livello sotto. Ogni nodo mostra il caso noto che
lo riconosce, oppure «?». Le catene uguali si uniscono, con il conteggio e l'intervallo. Una catena che non si è
potuta seguire dice dove e perché si è interrotta.

In interop le catene hanno un elemento solo: è l'elenco dei casi trovati, in ordine di tempo.

**Watchtower** riceve ancora un'analisi per occorrenza. Le catene stanno in `conclusionNotes`. Lo stato proposto è
`COMPLETED` se almeno una catena arriva a un caso noto chiudibile (§3.6).

**Chi scrive un runbook** non dichiara più `priority` né `next: 'resolve'`. Dichiara i **livelli** della sua
indagine e, quando due casi descrivono lo stesso errore, `supersedes`.

**Chi rilascia**: è una modifica incompatibile di `@pagopa/go-runbook` (in prerelease `next`) e richiede una
modifica di `@pagopa/go-aws`. La Lambda di go-watchtower che importa il package va adeguata insieme.

## 3. La proposta

### 3.1 L'albero degli errori

Un runbook indaga per **livelli**. Il livello 0 parte dalla finestra dell'allarme. Ogni livello successivo parte da un
errore del livello sopra.

```typescript
interface ErrorNode {
  /** 0 = radice. */
  readonly level: number;
  /** Identità nel livello: requestId, trace id, sorgente più requestId, o una chiave sintetica. */
  readonly key: string;
  /** Descrizione breve: «500 POST /delivery», «errore in pn-delivery». */
  readonly label: string;
  /** ISO-8601 UTC. */
  readonly occurredAt: string;
  /** requestId, trace id, sorgente: validati, etichette sicure, limitati in lunghezza. */
  readonly correlation: Readonly<Record<string, string>>;
  readonly vars: Readonly<Record<string, string>>;
  /** Le righe d'errore di questo nodo: nel suo contesto `steps.<id>` restituisce solo queste. */
  readonly scopedOutputs: Readonly<Record<string, ReadonlyArray<unknown>>>;
  /**
   * Le righe correlate allo stesso identificatore che non sono errori (INFO, successi, completamenti):
   * nel contesto del nodo si leggono come `steps.<id>.context`. Servono all'instradamento e ai casi che
   * le chiedono esplicitamente; non diventano nodi.
   */
  readonly contextOutputs: Readonly<Record<string, ReadonlyArray<unknown>>>;
  /** Dove scendere: il livello figlio e l'identificatore con cui interrogarlo. Assente per una foglia. */
  readonly descend?: ReadonlyArray<{ readonly target: string; readonly identifier: string }>;
}
```

- **Livello.** Il builder dichiara i livelli del runbook. Un livello ha tre parti:
  1. la **lettura**, gli step che interrogano CloudWatch;
  2. l'**enumeratore**, lo step che divide le righe lette in nodi, ciascuno con il suo padre;
  3. gli **step per nodo**, eseguiti per ogni nodo.

  Un livello ha un nome (`target`): per esempio `pn-delivery` o `downstream-logs`.

- **Come scende il motore.** Procede livello per livello, in quattro fasi.
  1. **Lettura ed enumerazione.** Esegue la lettura del livello e l'enumeratore. Una lettura può avere un **secondo
     tentativo allo stesso livello**: oggi, quando il fallback UUID trova un trace id, `DecideNextStep` rilegge lo
     stesso servizio. Il secondo tentativo non è una discesa. È tipizzato, si fa a lotti come il primo, e le righe dei
     due tentativi si uniscono per identità della riga (`@ptr`, o tempo, log stream e messaggio), così un errore
     trovato da entrambi conta una volta. Ogni tentativo ha la sua copertura. L'enumeratore lavora sulle righe unite.
  2. **Step per nodo.** Per ogni nodo esegue gli step in un **contesto isolato**: parametri, letture del livello,
     variabili degli antenati in sola lettura, `vars`, `scopedOutputs` e `contextOutputs` del nodo. Variabili e
     output scritti per un nodo non passano agli altri. Gli step decidono i `descend`, anche guardando le righe di
     contesto (per esempio la riga INFO che porta NotificationReceived verso Checkout).
  3. **Discesa.** Raccoglie i `descend` di tutti i nodi e li **raggruppa per `target`**. Per ogni `target` esegue
     **una lettura sola** con tutti gli identificatori in `OR`, a lotti entro i limiti della query (per esempio 50
     identificatori). Ripartisce poi le righe tra i padri per identificatore esatto: è ciò che oggi si fa già per
     l'execution log. La lettura pubblica nel contesto di **ogni padre** l'esito della sua discesa (§3.2), anche quando
     per quel padre non ci sono righe.
  4. **Dopo la discesa.** Per ogni padre girano gli step dichiarati `afterDescend` del livello, per esempio la sonda di
     versioning B2B dopo la lettura di `pn-delivery`. Poi si valutano **i casi del nodo**. Un nodo si valuta quindi
     solo quando le sue discese sono concluse: lette, saltate o fallite.

  Il motore ricomincia dal livello figlio, finché nessun nodo ha più un `descend`. Un nodo senza `descend` si valuta
  subito dopo i suoi step.

- **Instradamento senza errori.** Una lettura può non produrre nodi d'errore per un padre e contenere comunque righe
  di contesto che indicano la strada. Per esempio NotificationReceived: `pn-external-registries` restituisce solo una
  riga INFO che porta a Checkout. In quel caso lo step d'instradamento del livello gira nel contesto del padre, sulle
  righe di contesto, e può aggiungere un `descend` **al padre**. Il figlio trovato si attacca alla catena del padre
  (`B → errore in Checkout`), senza un nodo per la riga INFO. Il servizio attraversato resta visibile nella catena come
  passaggio (`via pn-external-registries`), non come errore.

- **Nessun limite di nodi per livello**: scelta del committente (D8). Il costo si governa con le letture
  raggruppate, e si misura prima del rilascio (§3.10).
- **Anti-ciclo.** Una catena non può contenere due volte la stessa coppia `(target, identificatore)`. Se succede, il
  ramo si chiude come interrotto, con motivo `cycle`. La protezione dai cicli e il limite di iterazioni di oggi
  valgono dentro ogni contesto di nodo.
- **Annullamento**: resta globale. Un abort ferma tutti i livelli.
- **Catena.** Una catena è il percorso da un nodo radice a una foglia. Un nodo con più figli genera più catene.
- **Interop e pipeline a finestra.** Hanno un livello solo, con un nodo di finestra: la lettura è quella di oggi, i
  casi si valutano su tutte le righe, e ogni caso trovato è una catena di un elemento. È lo stesso modello, senza
  discesa.
- **Visibilità.** Livelli, enumeratori e step per nodo sono esposti con `nestedSteps()`. Li vedono quindi:
  - `collectRunbookSteps`, la preparazione di servizi e account;
  - `assertCloudExecutableRunbook`;
  - il digest della definizione;
  - i validatori della costruzione, cioè `wiredStepIds()`, `findUnwiredKnownCaseStepRef`, gli id duplicati o che ne
    nascondono un altro fra ambiti, e i `goTo` validati con l'indice limitato al blocco, come a runtime.

### 3.2 I casi noti nell'albero

- **`KnownCase.priority` sparisce.** I casi si valutano nell'ordine di dichiarazione e `DUPLICATE_CASE_PRIORITY` si
  toglie.
- **Livello di un caso.** Un caso appartiene al **livello più profondo** degli step che la sua condizione legge. Il
  builder lo calcola alla costruzione, e rifiuta un caso che legge step di due livelli che non stanno sulla stessa
  catena.
  - Il caso si valuta su ogni nodo del suo livello e può leggere le variabili degli antenati. Per esempio
    `apiGwStatusIs('500')` legge la richiesta radice, mentre la regex legge le righe del nodo in `pn-delivery`.
  - I casi di oggi non si riscrivono: si riordina il catalogo SEND perché ogni step stia al suo livello.
- **Alternative per livello.** Un caso può dichiarare `alternatives`, ciascuna con la sua condizione, sotto la stessa
  identità pubblica (id, descrizione, risoluzione, analisi).
  - Ogni alternativa ha il suo livello, e il builder la valida sulle strade che la raggiungono.
  - Il caso corrisponde su un nodo se corrisponde l'alternativa del livello di quel nodo.
  - Serve ai casi che oggi uniscono con `or` servizi raggiungibili per strade diverse. Per esempio
    `checkout-connect-timeout` di NotificationReceived diventa un'alternativa su `pn-external-registries` e una su
    `pn-external-registries-checkout`, raggiungibile direttamente da `pn-bff` o passando da `pn-external-registries`.
- **Valori derivati con tre stati.** Uno step che deriva un vero o falso dall'evidenza (per esempio
  `sequenceConfirmed` di `AnalyzeAuditFallbackStep` in interop) pubblica `true`, `false` oppure `unknown`. Pubblica
  `unknown` quando l'evidenza su cui decide è incompleta, invece di un `false` certo.
  - Una condizione `not(...)` su un valore derivato richiede il valore esplicito: per esempio
    `varEquals('sequenceConfirmed', 'false')`, non `not(varEquals(..., 'true'))`.
  - Il catalogo si rivede in questo senso: le 7 condizioni con `not(...)` e i valori derivati che leggono. Il caso
    WAF timeout di `interop-auth-server-apigw-5xx`, che propone `COMPLETED`, richiede una conferma esplicita.
- **Più casi sullo stesso nodo**: il nodo li mostra tutti.
- **`supersedes?: readonly string[]`** (D3): se X corrisponde su un nodo, i casi elencati in `X.supersedes` si tolgono
  **da quel nodo**. Restano nella traccia con `supersededBy`. Il builder rifiuta id inesistenti, la sostituzione di sé
  stesso e i cicli (`UNKNOWN_SUPERSEDED_CASE`, `SUPERSEDES_CYCLE`). Si usa solo quando i due casi descrivono lo stesso
  errore.
- **Un nodo senza caso** si mostra con «?» e la sua descrizione.
- **Assenza al livello del padre.** Un caso come «500 senza log applicativi» guarda il livello figlio dal padre, e si
  valuta nella fase «dopo la discesa» (§3.1). La lettura di un livello pubblica nel contesto di ogni padre, anche con
  zero righe:
  - `<target>LookupState`, che vale `queried`, `saturated`, `skipped` o `unavailable`. È lo stato **di quel padre**:
    se il lotto che conteneva il suo identificatore è saturo, lo stato è `saturated` anche se per lui non è arrivata
    nessuna riga;
  - `<target>LogCountAllVisits`, le righe trovate per quel padre in tutte le visite.

  Le condizioni d'assenza richiedono `LookupState == 'queried'` e un conteggio zero. Le condizioni che leggono righe
  di contesto le chiedono esplicitamente (`steps.<id>.context`). Per esempio, il caso B2B «connessione interrotta più
  due righe di successo o completamento» legge l'errore dal nodo e i successi dal contesto. Le condizioni positive che
  vogliono solo sapere se un servizio è stato interrogato leggono lo stato: la guardia del BFF InfoPa e il timeout
  data-vault di B2B. Una lettura saltata non è mai una lettura vuota.

- **Righe d'errore di supporto.** Un caso può chiedere esplicitamente le altre righe d'errore dello stesso
  identificatore (`steps.<id>.siblings`) come evidenza di supporto. La corrispondenza resta **ancorata al nodo**: il
  ramo che legge `steps.<id>` deve essere soddisfatto dalla riga del nodo, mentre le righe di supporto completano la
  condizione.
  - È il caso InfoPa che richiede la telemetria Selfcare fallita e un timeout di retry distinto. Si ancora sul nodo
    del timeout, e la telemetria arriva da una riga sorella.
  - Ogni riga d'errore resta comunque un nodo a sé.
  - La fixture di oggi passa invariata: le due righe insieme corrispondono, ciascuna da sola no.
- **Esclusioni sulla lettura figlia.** Un caso del padre può richiedere che una lettura figlia **non** contenga certe
  diagnosi. Per esempio `delivery-external-registries-read-timeout` di B2B, che propone `COMPLETED`, richiede che la
  lettura di `pn-external-registries` non contenga tre diagnosi più specifiche.
  - L'esclusione si dichiara sul livello e si valuta sull'**intera** lettura figlia di quel padre, dopo la discesa.
  - Il risultato si pubblica sul padre come `<target>Exclusion.<nome>`, con tre stati:
    - `present`: la diagnosi esclusa è stata vista;
    - `absent`: la lettura è completa e la diagnosi non c'è;
    - `unknown`: la lettura è incompleta, saltata o fallita.
  - Il caso richiede `absent`. Il caso appartiene al livello del padre, che è la sua dipendenza dichiarata (D14), e D5
    si applica al nodo padre. Una negazione valutata su un singolo figlio non può più soddisfare l'esclusione.

### 3.3 Il tempo e l'evidenza

- **Lettore del tempo**, iniettato in `RunbookEngineOptions` come il `logActionRenderer`:

  ```typescript
  type EvidenceTimeReader = (
    element: unknown,
  ) => { readonly first: number; readonly last: number; readonly weight: number } | undefined;
  ```

  | Forma dell'elemento          | Tempo                                             | Peso                    |
  | ---------------------------- | ------------------------------------------------- | ----------------------- |
  | Riga semplice                | `@timestamp` (o `timestamp`), normalizzato in UTC | 1                       |
  | Riga aggregata               | `firstTimestamp` e `latestTimestamp`              | `count`                 |
  | Oggetto con `supportingRows` | minimo e massimo delle righe che lo sostengono    | righe che lo sostengono |
  | Gruppo `{ …, rows }`         | intervallo del gruppo (approssimato)              | 1                       |

  Le query aggregate interop aggiungono `earliest(@timestamp) as firstTimestamp` e ordinano per
  `latestTimestamp desc`. Il BFF dichiara in `supportingRows` le righe della sequenza che prova il caso.

- **Valutazione.** Nella valutazione dettagliata il `ConditionEvaluator` raccoglie gli **indici** di tutte le righe
  che corrispondono, non solo i 10 campioni. `pattern` non si ferma alla prima.
  - L'evidenza di un caso viene solo dai rami logicamente soddisfatti: per `and` tutti, per `or` quelli soddisfatti,
    per `not` nessuno.
  - L'insieme è senza duplicati per `(ref, indice)`. Il conteggio si chiama `evidenceRows` e non si presenta come
    «N volte».
- **Tempo di un nodo** = il suo `occurredAt`. **Tempo di un caso su un nodo** = la sua evidenza, oppure
  `occurredAt` del nodo se l'evidenza non ha tempo. **Tempo di una catena** = `occurredAt` della radice.
- **Catene di finestra** (interop, SPID Hub, Logsaver): il nodo di finestra non ha un tempo suo. Ogni catena prende
  primo e ultimo tempo dall'evidenza del suo caso. Se l'evidenza non ha tempo, la catena non ha tempo e va in fondo,
  nell'ordine di dichiarazione (D7). Il peso di un aggregato (`count`) resta nelle `evidenceRows` e non diventa il
  numero di catene unite.
- **Visite ripetute.** Uno step può girare più volte nello stesso contesto di nodo, per esempio un fallback UUID e
  poi il trace id. Il contesto conserva gli output di tutte le visite: per l'evidenza `steps.<id>` restituisce le
  righe di tutte, e le variabili scalari restano quelle dell'ultima scrittura, per la traversata.

### 3.4 La copertura

Uno step che non vede tutta l'evidenza lo dichiara, invece di lanciare un errore o tacere:

```typescript
interface StepCoverage {
  /** Etichetta sicura (account logico, log group, lotto), mai un nome di profilo AWS locale. */
  readonly source?: string;
  readonly complete: boolean;
  readonly reason?: 'saturated' | 'unavailable' | 'skipped' | 'manual';
  /** Al più 200 caratteri, ripulito dai nomi di profilo; non entra nella bozza. */
  readonly detail?: string;
}
```

`StepResult.coverage` è un elenco con una voce per sorgente. Il motore lo raccoglie per nodo e per esecuzione.

- **Saturazione alla frontiera della query.** Il livello comune delle query Logs Insights dichiara `saturated` quando
  le righe sono tante quante il limite, oppure quando la risposta ha altre pagine non lette (`nextToken`). La misura si
  fa sul risultato grezzo, prima di filtri, aggregazioni o fusioni, e viaggia con il risultato riusato. Restano anche i
  controlli `recordsMatched` di Logsaver e del contesto del pod interop.
- **Eccezioni che diventano voci.** Diventano voci di copertura, con le righe già lette conservate:
  - i limiti di righe che oggi fanno lanciare un errore (contesto del pod interop, SPID Hub, sorgente satura della
    variante Lambda multi-account);
  - le letture fallite degli hook di Stream e della sonda B2B (`unavailable`);
  - le letture saltate per mancanza di un identificatore utilizzabile (`skipped`);
  - la correlazione manuale di SPID Hub (`manual`).
- **Step con più letture** (tracker dei CID, Logsaver, multi-account):
  - ogni lettura è indipendente dalle altre, qualunque sia l'ordine;
  - si pubblicano le righe delle letture riuscite;
  - una lettura fallita diventa `unavailable`.

  La scelta delle sorgenti e i controlli di account e autorizzazione restano nel preflight: un errore lì è di
  configurazione e fa fallire l'esecuzione.

- **Fallimenti dopo aver raccolto evidenza.** Se uno step fallisce in un contesto di nodo (con o senza
  `continueOnFailure`, anche `silent`):
  - i casi si valutano sul contesto raggiunto, e le rilevazioni positive restano;
  - il nodo è «analisi fallita» e la catena si interrompe lì;
  - gli altri nodi proseguono.

  L'esecuzione è `failed` solo se fallisce prima di aver raccolto qualunque evidenza, per esempio la lettura del
  livello 0 o un errore di configurazione.

- **Copertura per identificatore.** In una lettura raggruppata la copertura si registra per ogni identificatore
  richiesto, anche quando per quell'identificatore non arriva nessuna riga.
- **Catene interrotte.** Una catena si interrompe con un motivo:
  - `skipped`: manca l'identificatore per scendere;
  - `unavailable`: la lettura del livello figlio è fallita;
  - `incomplete`: la discesa era richiesta, la lettura è satura e per questo padre non è arrivato nessun figlio;
  - `failed`: lo step del nodo è fallito;
  - `cycle`.

  Se la lettura del livello figlio è satura e i figli arrivano, restano, e le loro catene portano il segnale
  «evidenza incompleta».

- **Foglia vera.** Una catena finisce in una **foglia vera** se il suo ultimo nodo non ha richiesto discese, oppure
  se ogni discesa richiesta si è conclusa con una lettura completa (`queried`) che non ha trovato errori. Ogni altra
  fine è un'interruzione.

- **Identificatori.** Un modulo comune valida requestId e trace id con una allowlist e li rende nei predicati con
  l'escaping di `@pagopa/go-aws`. Una riga senza identificatore valido è un nodo con **chiave sintetica**, che non può
  scendere: la sua catena è interrotta con `skipped` dove serviva un livello sotto.
- **Attribuzione per tipo di lettura.** Le righe restituite da una lettura per identificatore si attribuiscono secondo
  il **tipo d'identificatore di quella lettura**:
  - per requestId e trace id, sul campo strutturato (`@requestId`, `trace_id`), e sul testo del messaggio solo se il
    campo manca;
  - per il fallback UUID, sul campo strutturato del fallback se c'è, altrimenti sul token esatto nel messaggio. Il
    `trace_id` di quelle righe non decide l'attribuzione: è l'identificatore scoperto per il secondo tentativo.

  Fra il primo tentativo e il secondo, la richiesta proprietaria resta la stessa.

### 3.5 Le famiglie

- **SEND API Gateway.**

  | Livello | Che cosa                            | Lettura                                                        | Nodi                                         | Scende                                                                                |
  | ------- | ----------------------------------- | -------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
  | 0       | richieste in errore                 | access log, `sort @timestamp asc`                              | una per richiesta, chiave sintetica senza id | verso il primo servizio del path (registro dei servizi noti), con trace id o fallback |
  | 1…n     | errori di un servizio per richiesta | log del servizio, una query per livello con i trace id in `OR` | una per riga d'errore, con il suo messaggio  | verso il servizio a valle indicato dalla riga (registro degli URL noti)               |

  Gli step per nodo del livello 0 sono l'authorizer, l'execution log e gli hook di Stream. Leggono solo la riga della
  richiesta.
  - L'execution log si interroga a lotti per requestId esatto, e il criterio è un requestId valido, non la presenza
    di `errorMessage`.
  - La sonda di versioning B2B è una lettura di finestra memorizzata, eseguita una volta. La sua applicabilità si
    valuta sul nodo radice, dopo la lettura di `pn-delivery`, con `pn-deliveryLookupState` e il conteggio.

  Non esistono più messaggi rappresentativi: ogni riga d'errore di un servizio è un nodo. Il conflitto DynamoDB e
  l'errore SQS di `pn-user-attributes` sono quindi due nodi della stessa richiesta.

- **Lambda.**
  - Livello 0: le invocazioni in errore. La chiave è la sorgente più il requestId (strutturato, poi dal messaggio come
    oggi). Ogni riga senza requestId valido è un nodo a sé, con chiave sintetica.
  - Step per nodo: la ricostruzione dell'invocazione, a lotti, con le righe verificate sull'identificatore
    strutturato.
  - Livello 1: i log del downstream, quando la categoria del nodo li indica.
  - Le varianti multi-account seguono la copertura per sorgente.
- **SEND service e downstream.**
  - Livello 0: le righe d'errore dei log applicativi, una per nodo, con il loro messaggio.
  - Livello 1: le righe del trace (una query per livello con i trace id in `OR`), un nodo per riga d'errore del trace.

  Il caso SelfcarePG («errore vuoto» al livello 0, `ReadTimeoutException` al livello 1) diventa una catena:
  `errore SelfcarePG vuoto → ReadTimeoutException`. Se nello stesso trace c'è il timeout di un'altra chiamata, anche
  quello è un nodo figlio e quindi un'altra catena. L'attribuzione alla singola chiamata (span, sequenza) resta fuori
  (§5).

- **SPID Hub, Logsaver, interop k8s e interop API GW**: un livello di finestra. I limiti del §1.2 diventano voci di
  copertura (§3.4).

### 3.6 L'output, la console e la bozza

**Output del runbook** (`RunbookOutput.schemaVersion` `2.0.0`, costante esportata da go-runbook e letta dai
consumatori):

```typescript
interface ErrorChainGroup {
  /** Sequenza dei nodi; un nodo senza caso ha `caseIds` vuoto («?»). */
  readonly nodes: ReadonlyArray<{
    readonly level: number;
    readonly target: string;
    readonly label: string;
    readonly caseIds: ReadonlyArray<string>;
    readonly status: 'recognized' | 'unrecognized' | 'failed';
  }>;
  readonly end: 'leaf' | 'interrupted';
  /** Tutte le interruzioni dei membri del gruppo, con il loro conteggio. */
  readonly interruptions: ReadonlyArray<{
    readonly reason: 'skipped' | 'unavailable' | 'incomplete' | 'failed' | 'cycle';
    readonly target?: string;
    readonly count: number;
  }>;
  /** true se almeno un membro ha evidenza incompleta. */
  readonly incompleteEvidence: boolean;
  /** Catene unite in questo gruppo. */
  readonly count: number;
  /** Assenti per le catene di finestra senza tempo (§3.3). */
  readonly firstSeenAt?: string;
  readonly lastSeenAt?: string;
  /**
   * Chiavi e correlazione delle prime catene del gruppo, al più 10, solo per la visualizzazione.
   * L'elenco completo dei membri resta nell'output strutturato locale (`members`) e serve al confronto (§3.8).
   */
  readonly samples: ReadonlyArray<{
    readonly key: string;
    readonly correlation: Readonly<Record<string, string>>;
  }>;
  /** Tutti i membri, con chiave, correlazione e tempo osservato; il primo campo che il callback toglie (§3.6). */
  readonly members: ReadonlyArray<{
    readonly key: string;
    readonly correlation: Readonly<Record<string, string>>;
    readonly occurredAt?: string;
  }>;
}
```

- **Raggruppamento** (D11, decisa): due catene si uniscono se hanno la stessa sequenza di `(target, caseIds)`, la
  stessa fine e lo stesso motivo d'interruzione. I nodi «?» si confrontano per `target`. Il gruppo riepiloga tutti i
  `target` d'interruzione dei suoi membri. I gruppi si ordinano per `firstSeenAt`, poi per ordine di dichiarazione dei
  casi; i gruppi senza tempo vanno in fondo.
- **`chains[]`** è un campo comune a tutti gli esiti, vuoto quando non c'è niente da riportare. Così anche un esito
  senza casi riconosciuti mostra i nodi «?» e le catene interrotte.
- **`outcome`**:
  - `known-case-matched` quando almeno un nodo è riconosciuto;
  - `unknown-case` quando nessun nodo è riconosciuto e l'evidenza è completa;
  - `inconclusive` quando nessun nodo è riconosciuto e l'evidenza non è completa.

  Spariscono `primaryCaseId`, `primaryCaseDescription`, `matchedCases[].priority`, `execution.earlyResolution` e
  `resolvedAtStep`.

- **Copertura**: nodi osservati per livello (con `lowerBound: true` se un'enumerazione è incompleta per qualunque
  motivo), nodi riconosciuti, non riconosciuti, falliti, catene interrotte per motivo, e `sources[]`.
- **Evidenza dichiarata** (`buildDeclaredOutputContext`): si costruisce per nodo, con la chiave del nodo. Per
  esempio, il campione dell'execution log di IO_EXP appartiene alla sua richiesta.
- **Azioni**: l'azione `log` di ogni caso riconosciuto si esegue **una volta per gruppo**, sul contesto del primo nodo
  del gruppo, in ordine di tempo. Ogni `resolvedMessage` e ogni testo grezzo copiato nel contesto (per esempio
  `lastErrorMsg`) si limita a 4.000 caratteri.

**Console**: il formato del §2. Una riga per gruppo: tempo, catena con `→`, conteggio e intervallo se è più di una.

**Bozza per Watchtower**: contratto `AnalysisDraftV1` invariato (D4).

- **`conclusionNotes`**: un elenco numerato dei gruppi in ordine di tempo. Ogni voce ha la catena e le risoluzioni
  dei casi riconosciuti della catena, prima quella della foglia e senza ripetizioni. In fondo, le righe di copertura
  quando non sono zero, compatte per motivo: «Non riconosciuti: K», «Catene interrotte: K (identificatore mancante S,
  lettura non disponibile U, …)», «Evidenza incompleta: K fonti».
- **Un gruppo con un solo nodo riconosciuto e nessuna riga di copertura**: la bozza è identica a quella di oggi.
- **`proposedStatus`** (D5, decisa dal committente): `COMPLETED` se **almeno una catena** termina in una **foglia
  vera** (§3.4) riconosciuta da un caso con `proposedStatus: 'COMPLETED'`. Altrimenti `IN_PROGRESS`. La condizione
  di quel caso deve essere stabilita: un valore derivato `unknown` non la soddisfa (§3.2).
  - La regola vale anche quando altre catene sono aperte, non riconosciute, interrotte o finiscono in casi da
    lavorare. Le note le elencano comunque.
  - Vale anche per interop: basta un caso chiudibile fra quelli trovati.
- **`analysisType`** (D12, proposta): `IGNORABLE` solo se tutte le catene terminano in casi `IGNORABLE` con lo stesso
  `ignoreReasonCode` e gli stessi `ignoreDetails`. Altrimenti `ANALYZABLE`, senza campi di ignore.
- **Liste**: unione dei default e dei casi riconosciuti, in ordine di tempo, senza duplicati.
- **Nessun nodo riconosciuto**: `UNKNOWN_CASE_CONTEXT`, invariato. La differenza fra `unknown-case` e `inconclusive`
  e la copertura viaggiano nell'output, nel `RunbookCheck` e nel `resultSummary`.

**Misura**: una sola funzione, esportata da go-runbook, usata dall'adattatore di completamento e dalla Lambda di
go-watchtower.

- **Bozza**: misurata come JSON in UTF-8.
  1. Si riservano i campi obbligatori, le liste e le righe di copertura.
  2. Si aggiungono voci intere finché ci stanno nei 5.000 caratteri del campo e nei byte residui dei 64 KiB.
     `errorDetails` ha un budget proprio con la stessa regola. Poi «… e altri K gruppi».
  3. Se nemmeno la prima voce ci sta, si tiene la sua catena e si accorcia la risoluzione.
  4. Poi si accorciano `links` e `finalActions`, mai `resources` e `downstreams`.
  5. Infine si accorciano i testi in modo deterministico, mantenendo copertura e prima catena.

  Il controllo statico (`buildPotentialAnalysisDrafts`, `assertAnalysisAnnotations`) verifica il caso peggiore delle
  liste e lo spazio minimo per la prima catena.

- **Corpo intero del callback** (≤ 1 MiB): si misura la richiesta intera. Se serve si riducono, in quest'ordine:
  1. i campioni di log e la telemetria;
  2. i `members` e poi i `samples` dei gruppi;
  3. l'evidenza dichiarata per nodo.

  Se non basta, si passa alla **forma terminale**, che ha un limite garantito:
  - esito e copertura compatta;
  - conteggi dei gruppi per stato;
  - un'**anteprima dei gruppi** in ordine di tempo, che si ferma quando il corpo arriva a 768 KiB;
  - il riferimento versionato all'output completo conservato;
  - un `resultSummary` limitato.

  Le forme compatta e terminale si abilitano **solo** nei produttori di callback che conservano l'output completo:
  oggi la Lambda di go-watchtower (§3.8). `go-execute-runbook` non lo conserva. Va ritirato prima di abilitarle
  ([DRAFT-001](../../drafts/DRAFT-001-ExecuteRunbookRemoval/DRAFT-001-ExecuteRunbookRemoval-CLAUDE-v01.md)). Finché
  resta, un corpo oltre 1 MiB fa fallire il callback in modo esplicito, come oggi.

- **Tracking**:
  - una voce per gruppo, con un identificatore tipizzato del primo campione: `TRACE_ID` se c'è, altrimenti
    `REQUEST_ID` (Lambda) o il tipo di correlazione applicabile. La voce si omette solo se il campione non ha
    identificatori utilizzabili;
  - l'istante della voce è il tempo osservato del membro scelto, non `generatedAt` dell'output. Per una catena senza
    tempo è `firedAt` dell'occorrenza. Così una voce di un'esecuzione in ritardo resta nella finestra del confronto;
  - entro le 64 voci del contratto, con lo slot dell'id d'esecuzione riservato;
  - `errorCode` al più 200 caratteri, `errorDetail` al più 2.000;
  - voci con identificatori oltre 255 caratteri saltate.

### 3.7 Il catalogo

1. Togliere `priority` dai 302 casi, dai 4 dei toolkit, dalle factory interop e da `KnownCaseSpec`.
2. Riordinare i runbook SEND per livelli (§3.5). Le condizioni restano, e ogni caso prende il suo livello (§3.2).
3. Rivedere le sovrapposizioni: si eseguono i test di tutti i runbook e si elencano i nodi su cui corrisponde più di
   un caso.
   - Già noti: il timeout di `pn-delivery-insert-trigger-eb-lambda` → `supersedes: ['lambda-timeout']`, e Workday
     `duplicated-event-400-02` → `supersedes: ['duplicated-event-err-cons']`, entrambi sul nodo.
   - Restano le 7 condizioni con `not(...)`, il condizionamento del BFF InfoPa e i casi dell'authorizer.
4. Le fasce 200/500 e il loro commento si tolgono.
5. Gli step che emettono `'resolve'` restituiscono `continue`.
6. Un controllo alla registrazione verifica che ogni query di evidenza proietti il tempo.
7. Si rigenerano le baseline (`canonical.json`, `fingerprints.json`) e il `definitionDigest`. Non serve migrare
   cataloghi: quello automatico non è mai stato rilasciato.

### 3.8 Chi legge i risultati

| Chi                                                                                                  | Che cosa cambia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/go/go-analyze-alarm`                                                                        | stampa le catene nel formato del §2, con la copertura                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `packages/go-watchtower-runbook` (`matchAnalysis`, `matchAnalysisAi`, `extractAnalysisEvidence`)     | confronto per coppia: un gruppo di catene e una voce di tracking umana, su **tutti** i membri del gruppo (`members`). Se è disponibile solo l'anteprima dei campioni, un identificatore umano che non vi compare è evidenza insufficiente, non un conflitto. Il testo unito non basta per l'accordo esatto, e un conflitto sul solo identificatore resta conflitto anche nel matcher AI. Con il contratto attuale di Watchtower (tracking umano non tipizzato) `MATCH_EXACT` non si emette, e il report lo dichiara |
| `packages/go-watchtower-runbook` (`classifyRunbookOutcome`, `checkOccurrence`, cache, `buildReport`) | classificazione di `inconclusive`. Copertura nel `RunbookCheck`. Nessuna scrittura in cache con voci `unavailable`, nodi falliti o catene interrotte per lettura fallita. Pulizia dei nomi di profilo **ai confini d'esportazione**: report RTA (compreso `input.awsProfiles`), output del runbook (input e telemetria delle query) e callback. Si omettono o si sostituiscono con etichette sicure. Report RTA `2.0.0`. Versione dell'output letta dalla costante di go-runbook                                    |
| `scripts/go/go-rta-check`                                                                            | catene e copertura al posto di `primaryCaseId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `scripts/go/go-execute-runbook`                                                                      | si adegua a output, bozza, misura e tracking, senza forme compatte né terminali perché non conserva l'output, oppure si elimina prima con la catena descritta in [DRAFT-001](../../drafts/DRAFT-001-ExecuteRunbookRemoval/DRAFT-001-ExecuteRunbookRemoval-CLAUDE-v01.md)                                                                                                                                                                                                                                            |
| Reporter dei toolkit                                                                                 | niente «← primario»; le catene                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Lambda dei runbook in go-watchtower (repository a parte)                                             | legge l'output `2.0.0`, usa la stessa funzione di misura, traduce `inconclusive` in `UNKNOWN_CASE` con la copertura nel `resultSummary`, e **conserva l'output completo** dove gli utenti autorizzati lo ritrovano dall'esecuzione                                                                                                                                                                                                                                                                                  |

### 3.9 Documentazione e rilascio

- `docs/RUNBOOKENGINE.md` (priorità, risoluzione anticipata, esempio didattico, ora i livelli), `docs/ARCHITECTURE.md`
  e il README di `go-runbook`.
- Un changeset per `@pagopa/go-runbook` (modifica incompatibile, `1.0.0-next.N`).
- Un changeset per `@pagopa/go-aws`, nella stessa release. Il risultato delle query espone le pagine non lette
  (`nextToken`), e go-runbook richiede quella versione minima. Il controllo dei package pubblicati verifica il runbook
  impacchettato contro le dipendenze pubblicate.
- **Condizione di rilascio verso Watchtower**: una fixture callback → rilettura sul ramo di go-watchtower che riceve
  le analisi. Codice e dettaglio devono arrivare nei campi di tracking dell'analisi: la proiezione è lavoro di
  go-watchtower, qui si fissa il requisito.
- Gli artefatti storici di `artifacts/runbook-automation/remediation/2026-10-17/` non si toccano.

### 3.10 Le fasi

Ogni fase si chiude con `pnpm check` verde.

1. **F1: il motore e interop.**
   - Contiene: albero dei livelli, casi per livello, tempo, copertura, niente priorità né `resolve`, output, console,
     bozza, consumatori, catalogo, documentazione.
   - Interop è completo già qui: un livello di finestra.
   - I runbook SEND passano al formato a catene ma seguono ancora **una catena sola**, scelta come oggi (la richiesta
     più grave). Dichiarano gli altri errori come osservati e non esaminati.
2. **F2: SEND API Gateway a livelli.** Prima del rilascio si misura il costo con `go-rta-check` su occorrenze reali,
   in sola lettura: query per livello, durata, righe scansionate, prima e dopo.
3. **F3: Lambda a livelli**, comprese le varianti multi-account.
4. **F4: SEND service e downstream a livelli**, più la copertura di SPID Hub e Logsaver.

## 4. Test e verifica

- **Albero**:
  - l'esempio del committente (A foglia; B → C; B → D → E) produce le tre catene nell'ordine giusto;
  - contesti di nodo isolati;
  - variabili degli antenati leggibili;
  - letture raggruppate per `target` con ripartizione per identificatore esatto;
  - a lotti oltre 50 identificatori;
  - anti-ciclo;
  - fasi: un nodo si valuta dopo che le sue discese sono concluse; step `afterDescend` dopo la lettura del figlio;
  - instradamento senza errori: la fixture di oggi di NotificationReceived, con la sola riga INFO verso Checkout,
    produce la catena fino all'errore in Checkout;
  - fallback UUID nel messaggio e `trace_id` diverso nel campo: la riga resta della richiesta, e il trace id guida il
    secondo tentativo;
  - secondo tentativo allo stesso livello (fallback UUID → trace id): niente discesa, righe unite senza doppioni,
    copertura per tentativo;
  - righe di contesto: NotificationReceived arriva a Checkout passando dalla riga INFO di `pn-external-registries`;
  - abort globale;
  - nessun limite di nodi per livello;
  - mutazione annidata rifiutata da `assertCloudExecutableRunbook`;
  - validatori della costruzione;
  - digest.
- **Casi**:
  - livello calcolato alla costruzione;
  - caso su due rami diversi rifiutato;
  - più casi sullo stesso nodo;
  - `supersedes` per nodo;
  - «?» per un nodo non riconosciuto;
  - assenza al livello del padre: lettura `skipped` → condizione non soddisfatta, anche su una seconda visita;
    fallback con righe e trace vuoto → `LogCountAllVisits` non zero;
  - guardia InfoPa con lettura satura: la rilevazione resta;
  - B2B 504 con lettura di `pn-delivery` completa e vuota: il caso d'assenza corrisponde sul nodo richiesta, nella
    fase dopo la discesa;
  - B2B «connessione interrotta più due successi»: errore dal nodo, successi dal contesto;
  - InfoPa: telemetria Selfcare fallita e timeout di retry insieme corrispondono, ciascuno da solo no;
  - B2B `delivery-external-registries-read-timeout`:
    - lettura figlia completa e vuota → `absent`, il caso corrisponde;
    - due figli, di cui uno con una diagnosi esclusa → `present`, il caso non corrisponde;
    - lettura satura → `unknown`, il caso non corrisponde;
  - `checkout-connect-timeout` con le sue alternative, raggiunto direttamente e passando da `pn-external-registries`;
  - WAF timeout di interop con una lettura satura: `sequenceConfirmed` vale `unknown`, il caso non corrisponde e non
    c'è `COMPLETED`.
- **Tempo ed evidenza**:
  - più di 10 righe con ordinamento `desc`;
  - `pattern` su tutte le righe;
  - rami non soddisfatti senza evidenza;
  - aggregati;
  - interop: un caso con evidenza dalle 10:01 alle 10:07 e un altro visto per la prima volta alle 10:03 si ordinano per
    tempo, non per dichiarazione; un caso senza tempo va in fondo;
  - `supportingRows` del BFF;
  - gruppi del tracker;
  - formato Logs Insights normalizzato in UTC.
- **Copertura**:
  - righe = limite;
  - `nextToken` sotto il limite;
  - saturazione misurata prima di un filtro;
  - `recordsMatched` di Logsaver e del contesto del pod;
  - multi-account in entrambi gli ordini, con una sorgente satura e una illeggibile;
  - tracker dei CID con una lettura fallita: le righe del CID A restano;
  - errore di preflight → esecuzione fallita;
  - Stream e B2B con lettura fallita;
  - identificatore mancante o rifiutato → chiave sintetica e catena interrotta;
  - fallimento di uno step per nodo dopo una rilevazione positiva (authorizer, poi `QueryServiceLogsStep` fallito) →
    la rilevazione resta, il nodo è fallito, gli altri proseguono.
- **Scenari SEND**:
  - API GW con un timeout dell'authorizer sulla richiesta A e un errore di servizio su B;
  - `pn-user-attributes` con un conflitto DynamoDB e un errore SQS sulla stessa richiesta → due nodi, due catene;
  - una riga 5xx senza requestId accanto a un 504 benigno → due catene;
  - IO_EXP: la diagnosi `integration-signature-mismatch` e il suo campione appartengono alla richiesta;
  - B2B: sonda di versioning eseguita una volta;
  - Lambda:
    - due timeout con requestId diversi → due catene con i loro messaggi;
    - righe senza requestId → nodi a sé;
    - l'invocazione B che nomina A nel messaggio non entra nella ricostruzione di A;
    - DailyExport senza nomi di profilo in `source`, correlazione o chiavi;
  - SelfcarePG: errore vuoto e timeout sullo stesso trace, su trace diversi, con un timeout di un'altra chiamata;
  - Workday: le due righe e la sostituzione per nodo.
- **Output e bozza**:
  - raggruppamento con conteggio e intervallo;
  - ordine dei gruppi;
  - catene interrotte con motivo;
  - un gruppo con un solo nodo riconosciuto e niente copertura → bozza uguale a oggi;
  - una lettura raggruppata satura in cui la richiesta A esaurisce le righe e B non ne riceve: la catena di B è
    interrotta `incomplete` e non conta come foglia vera per D5;
  - un gruppo con membri interrotti su `target` diversi li riepiloga tutti;
  - esito `inconclusive` con le sole catene «?» e interrotte, riportate in `chains[]`;
  - stato secondo D5:
    - una catena chiudibile e una da lavorare → `COMPLETED`;
    - nessuna catena chiudibile → `IN_PROGRESS`;
    - interop con un caso chiudibile fra altri → `COMPLETED`;
  - tipo secondo D12;
  - `unknown-case` e `inconclusive`;
  - misura con testi multibyte, `errorDetails` composti, liste vuote, prima voce lunga;
  - corpo del callback con un messaggio Lambda di 600 KiB e con molti gruppi;
  - un'esecuzione in ritardo: le voci di tracking portano il tempo dell'errore e restano nel confronto;
  - report RTA e output del callback senza nomi di profilo locali, compresi `input.awsProfiles` e la telemetria;
  - confronto con un identificatore umano che corrisponde all'undicesimo membro di un gruppo: accordo trovato;
  - tracking entro 64 voci, 200 e 2.000 caratteri, identificatori lunghi saltati, `REQUEST_ID` per Lambda senza trace
    id;
  - forma terminale del callback con migliaia di gruppi distinti: corpo entro 1 MiB, anteprima limitata, riferimento
    all'output conservato;
  - fixture dello schema di Watchtower;
  - fixture callback → rilettura.
- **Lettori**:
  - cache: voci della v1 scartate e nessuna scrittura con evidenza mancante;
  - report RTA versionato e ripulito dai nomi di profilo;
  - matcher a coppie con gli scenari incrociati;
  - `MATCH_EXACT` mai emesso con il contratto attuale.
- **Verifica reale, in sola lettura**: `go-rta-check` su occorrenze recenti di API GW, Lambda, service, downstream e
  interop, prima e dopo. Si confrontano catene, ordine, copertura, query, durata e accordo con le analisi umane.
- **Gate**: `pnpm check` e `pnpm lint`, compresi i controlli dei package pubblicati.

## 5. Fuori da questa specifica

- Un contratto Watchtower v2 con le catene strutturate al posto delle note composte (D4).
- La paginazione o il partizionamento nel tempo delle query: la saturazione si dichiara.
- L'attribuzione dell'evidenza alla singola chiamata dentro un trace (span, sequenza): ogni riga d'errore del trace è
  un nodo, senza legarla a una chiamata precisa.
- Il tempo della singola riga dentro un gruppo del tracker dei CID: si usa l'intervallo del gruppo.
- Le righe d'errore che nessun caso spiega nelle pipeline a finestra (D9, rimandata).
- Le azioni `notify`, `escalate`, `update` e `composite`, che nessun caso usa.
- La priorità degli allarmi in Watchtower.

## 6. Le scelte del committente

| Scelta                                            | Stato                   | Contenuto                                                                                                                                                                         |
| ------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 · Una specifica unica, SEND compreso           | **decisa** (19/11/2026) | interop e SEND nella stessa specifica, con il modello ad albero                                                                                                                   |
| D2 · Risoluzione anticipata                       | proposta                | si toglie: fermarsi al primo caso impedisce di trovare tutti gli errori                                                                                                           |
| D3 · Sovrapposizioni                              | proposta                | `supersedes` per nodo; `not(...)` resta disponibile                                                                                                                               |
| D4 · Contratto della bozza                        | proposta                | si tiene `AnalysisDraftV1`, con le catene in `conclusionNotes`                                                                                                                    |
| D5 · Stato proposto                               | **decisa** (19/11/2026) | `COMPLETED` se almeno una catena termina in una foglia vera riconosciuta da un caso noto chiudibile, anche con altre catene aperte. Sostituisce le fasce 200/500 e la vecchia D10 |
| D6 · Azioni                                       | proposta                | l'azione di ogni caso riconosciuto, una volta per gruppo, in ordine di tempo                                                                                                      |
| D7 · Casi senza tempo                             | proposta                | prendono il tempo del nodo; in un livello di finestra senza tempo vanno in fondo, in ordine di dichiarazione                                                                      |
| D8 · Limite di nodi per livello                   | **decisa** (19/11/2026) | nessun limite; costo governato dalle letture raggruppate e misurato prima del rilascio                                                                                            |
| D9 · Righe non spiegate nelle pipeline a finestra | rimandata               | si riprende dopo F1, sui risultati reali                                                                                                                                          |
| D10 · Errori non esaminati in F1                  | superata da D5          | —                                                                                                                                                                                 |
| D11 · Catene uguali                               | **decisa** (19/11/2026) | unite, con conteggio e intervallo                                                                                                                                                 |
| D12 · Tipo dell'analisi                           | proposta                | `IGNORABLE` solo se tutte le catene terminano in casi `IGNORABLE` con lo stesso motivo                                                                                            |
| D13 · Nodi non riconosciuti e catene interrotte   | **decisa** (19/11/2026) | mostrati, con «?» o con il motivo dell'interruzione                                                                                                                               |
| D14 · Livello dei casi                            | **decisa** (19/11/2026) | il livello più profondo che la condizione guarda, con accesso agli antenati                                                                                                       |
