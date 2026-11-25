# SPEC-002 · Runbook Automation: tutti gli errori, in ordine di tempo — v02

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: la richiesta del committente del 19 novembre 2026
- Revisione: la v02 recepisce il primo giro di revisione di Codex; rilievi e decisioni sono nel registro.

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

Gli altri casi trovati restano nella traccia e in `outcome.matchedCases`, ma l'operatore e Watchtower vedono una sola
diagnosi. Se nella finestra dell'allarme ci sono due errori diversi, il secondo sparisce.

### 1.2 La risoluzione anticipata smette di cercare

Uno step che restituisce `next: 'resolve'` fa valutare i casi a metà pipeline: se almeno uno corrisponde, il motore
**interrompe la pipeline** e salta la valutazione finale. Gli step successivi non girano, quindi gli errori che solo
loro avrebbero trovato non vengono mai cercati.

| Chi emette `'resolve'`                                                                 | Che cosa salta                                                        |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `EvaluateApiGwAuthorizerFailureStep` (SEND API GW)                                     | execution log, hook `before-service-traversal`, l'intera traversata   |
| `QueryApiGwExecutionLogsStep` (SEND API GW)                                            | la traversata dei servizi                                             |
| `AnalyzeTraversedServiceLogsStep` (SEND API GW, per servizio)                          | `decide-<svc>`, i servizi successivi, gli hook `after-entry-analysis` |
| `AnalyzeApplicationLogsStep` (`createServiceAlarmRunbook`)                             | gli hook `after-service-analysis` e `QueryServiceTraceLogsStep`       |
| `AnalyzeInteropCidTrackerStep` (interop k8s e API GW)                                  | niente: è l'ultimo step                                               |
| 5 step del catalogo SEND (stream delivery, IO_EXP, versioning Lambda, delayer, Postel) | il resto della loro pipeline                                          |

### 1.3 Tre famiglie scelgono un solo errore prima ancora dei casi

Togliere la priorità dai casi non basta. Tre famiglie SEND riducono l'evidenza a **un errore rappresentativo** prima
che i casi vengano valutati:

- **API Gateway** (`createSendApiGwAlarmRunbook`, 9 runbook). La query dell'access log ordina per gravità
  (`sort status desc, authorizerStatus desc, integrationServiceStatus desc, @timestamp asc | limit 1000`).
  `ParseApiGwErrorsStep` tiene solo la prima riga: status, path, messaggio e trace id finiscono in variabili scalari
  (`apiGwStatusCode`, `apiGwErrorMessage`, `xRayTraceId`, …), e `QueryServiceLogsStep` interroga i servizi **con quel
  solo trace id**. Anche gli step dell'authorizer e dell'execution log leggono tutto l'access log: il primo cerca un
  timeout in qualunque riga, il secondo scrive i campi della prima richiesta con un messaggio d'errore.
- **Lambda** (`createSendLambdaAlarmRunbook`, 12 runbook). La query degli errori è `sort @timestamp desc | limit 1000`.
  `scanLambdaLogs` dà una categoria sola a tutta la finestra (`timeout` vince su tutto) e un messaggio
  rappresentativo. Le varianti multi-account (DailyExport, downstream-monitoring) sostituiscono entrambe le query, e
  la query delle invocazioni costruisce le richieste dall'intero output degli errori.
- **Service e downstream** (`createSendServiceAlarmRunbook` 4 e `createDownstreamAlarmRunbook` 11, entrambi su
  `createServiceAlarmRunbook`). `scanApplicationLogs` sceglie il messaggio più recente come rappresentativo e, a parte,
  il primo trace id valido. `QueryServiceTraceLogsStep` interroga solo quel trace. Un caso come
  `selfcarepg-read-timeout-with-empty-error` (`personal-data-vault-SelfcarePG-downstream-detection-Alarm`) unisce il
  messaggio rappresentativo e la query sul trace: se l'errore vuoto e il timeout stanno su trace diversi, il caso si
  perde oppure unisce i sintomi di due richieste.

In tutto **26 delle circa 245 condizioni** del catalogo si basano solo su variabili scalari, senza righe di log come
evidenza. Sono quasi tutte API GW e Lambda.

Le famiglie interop k8s e interop API GW confrontano invece i casi con **tutte** le righe della query
(`stepEvidenceMatches`, cioè `contains` con regex sull'output dello step). Interop API GW però lavora su **righe
aggregate**: `count` e `latestTimestamp` per gruppo (status, path, errore, …), e `QueryInteropApiGwAggregatesStep`
copia `latestTimestamp` in `@timestamp`. Un gruppo di sette errori tra le 10:00 e le 10:20 oggi ha solo «10:20».

### 1.4 La priorità porta significati che nessuno dichiara

Nel catalogo ci sono **302 valori di `priority`** su 72 runbook (38 SEND, 34 interop), più 4 nei casi condivisi dei
toolkit. Oltre all'ordine, il numero codifica regole che non stanno scritte da nessuna parte:

1. **Fasce di sicurezza.** `pn-delivery-B2B-ApiGwAlarm/knownCases.ts`: «Actionable/manual cases use the 500 range.
   Automatically closable cases use the 200 range, so a benign overlap can never hide work still required». La
   priorità impedisce che un caso chiudibile in automatico (`COMPLETED`) nasconda un caso che richiede lavoro.
2. **Specifico sopra generico.** I casi «API Gateway 500 senza log applicativi correlati» (`GENERIC_API_GATEWAY_500`)
   si sovrappongono a ogni causa specifica di un 500. In `workday-pn-external-channel-alb-alarm` il caso
   `duplicated-event-400-02` (tre marcatori) contiene `duplicated-event-err-cons` (un marcatore), con la stessa
   risoluzione.
3. **Sostituzione di un caso condiviso.** `pn-delivery-insert-trigger-eb-lambda…/knownCases.ts` dichiara un timeout
   con condizione **identica** al `lambda-timeout` condiviso (`lambdaErrorCategory == timeout`) e priorità 110 contro
   100, solo per sostituirne la risoluzione. Se si riportano tutti i casi, escono entrambi per lo stesso errore.
4. **Casi che vincono su tutto.** I due casi dell'authorizer valgono 10.000 e 9.999 e sono valutati anche in anticipo.
5. **Univocità imposta.** `RunbookBuilder` rifiuta due casi con la stessa priorità (`DUPLICATE_CASE_PRIORITY`): ogni
   autore deve scegliere un numero anche per casi che non si sovrappongono mai.

Il catalogo contiene già anche il modo esplicito di gestire le sovrapposizioni: 7 condizioni usano `not(...)` per
escludere le cause più specifiche, e il caso BFF InfoPa è condizionato a `varExists('externalRegistriesLogCount')`
«so the BFF symptom cannot hide a more specific cause».

### 1.5 Il tempo non è un dato del motore

Le righe di CloudWatch portano `@timestamp` quando la query lo proietta, e la condizione le confronta come testo
intero. Ma:

- il motore non ha un campo "quando" né per l'evidenza né per i casi;
- `pattern` si ferma alla prima riga che corrisponde, e `contains` con regex conserva nella traccia solo 10 righe di
  esempio;
- le query ordinano a volte `asc` e a volte `desc`, e alcune per gravità: la prima riga trovata non è la più vecchia;
- con `limit 1000` dopo un ordinamento per gravità o `desc`, gli errori più vecchi possono non arrivare affatto;
- le variabili scalari (`vars.*`) non hanno tempo.

Oggi quindi non si può ordinare per tempo neanche ciò che già si trova.

## 2. Che cosa vede chi usa il repository

- **Chi analizza un allarme** (console di `go-analyze-alarm` e `go-rta-check`) vede l'elenco di tutti i casi noti
  individuati, dal più vecchio al più recente. Per ciascuno vede la prima e l'ultima volta in cui si è visto, quante
  volte e, dove c'è, la richiesta (requestId o trace id). Vede anche gli errori senza caso, quelli la cui analisi è
  fallita e quelli non esaminati. Non c'è più un caso "primario".
- **Watchtower** riceve ancora **un'analisi per occorrenza**. Se l'analisi è completa e trova un caso solo, la bozza
  resta identica a oggi. Negli altri casi `conclusionNotes` elenca i casi in ordine di tempo, e stato e tipo seguono
  regole esplicite (§3.5) invece della priorità.
- **Chi scrive un runbook** non dichiara più `priority`. Quando due casi descrivono lo stesso errore, lo dice con
  `supersedes` (§3.2). Non esiste più `next: 'resolve'`.
- **Chi rilascia**: è una modifica incompatibile di `@pagopa/go-runbook`, ancora in prerelease (`next`). La Lambda di
  go-watchtower che importa il package va adeguata insieme (§3.7).

## 3. La proposta

### 3.1 Il modello: la rilevazione

Al posto di "il caso che vince" il risultato diventa un elenco di **rilevazioni**. Una rilevazione è un caso noto che
corrisponde all'evidenza, con il suo tempo e il contesto da cui si rende:

```typescript
interface KnownCaseDetection {
  readonly knownCase: KnownCase;
  /** Prima evidenza che soddisfa il caso (ISO-8601 UTC); assente se l'evidenza non ha tempo. */
  readonly firstSeenAt?: string;
  /** Ultima evidenza che soddisfa il caso. */
  readonly lastSeenAt?: string;
  /** Occorrenze di evidenza che soddisfano il caso; una riga aggregata vale il suo `count`. */
  readonly evidenceCount: number;
  /** Errore a cui appartiene, quando l'analisi è per errore (§3.3). */
  readonly errorKey?: string;
  /** Contesto da cui si rendono azione, messaggio e testi della bozza: quello dell'errore, o quello dell'esecuzione. */
  readonly context: RunbookContext;
}
```

**Ordine**: `firstSeenAt` crescente. A parità di tempo vale l'ordine di dichiarazione nel runbook. Le rilevazioni
senza tempo vanno in fondo, anch'esse nell'ordine di dichiarazione (D7). L'ordine è deterministico: lo stesso input
produce sempre lo stesso elenco.

### 3.2 Il motore

- **`KnownCase.priority` sparisce**. I casi si valutano nell'ordine di dichiarazione e la validazione
  `DUPLICATE_CASE_PRIORITY` si toglie.
- **`supersedes?: readonly string[]`** sul caso (D3). Se il caso X corrisponde, i casi elencati in `X.supersedes`
  **nello stesso ambito** si tolgono dalle rilevazioni: restano nella traccia con `supersededBy: 'X'`. L'ambito è
  l'errore con l'analisi per errore, altrimenti l'esecuzione. Il builder rifiuta id inesistenti, un caso che
  sostituisce sé stesso e i cicli (`UNKNOWN_SUPERSEDED_CASE`, `SUPERSEDES_CYCLE`). Vuol dire "X è una spiegazione
  più precisa dello stesso errore": si usa solo quando i due casi descrivono davvero lo stesso errore, come nei due
  esempi del §1.4. Due errori diversi restano due rilevazioni.
- **Il tempo dell'evidenza.** `RunbookEngineOptions` riceve un lettore iniettato, come oggi riceve il
  `logActionRenderer`:

  ```typescript
  type EvidenceTimeReader = (
    element: unknown,
  ) => { readonly first: number; readonly last: number; readonly weight: number } | undefined;
  ```

  Così il motore non conosce il formato delle righe CloudWatch. Il toolkit comune fornisce il lettore delle righe
  Logs Insights. Una riga semplice dà `@timestamp` (o `timestamp`) normalizzato in UTC, con peso 1. Una riga
  aggregata dà `firstTimestamp`/`latestTimestamp` e il peso `count`. Le query aggregate di interop (access log e
  warning di servizio) aggiungono `earliest(@timestamp) as firstTimestamp`.

- **Valutazione.** Nella valutazione dettagliata il `ConditionEvaluator` raccoglie, per ogni predicato su un array, gli
  **indici** di tutte le righe che corrispondono, non solo i 10 campioni della traccia. `pattern` in modalità
  dettagliata non si ferma più alla prima riga: il costo resta O(N), come `contains`. Per il caso, l'evidenza è
  l'unione, senza duplicati, delle righe `(ref, indice)` dei predicati che corrispondono. `not` non porta evidenza.
  Una riga che soddisfa più rami conta una volta sola. Tempo e conteggio si calcolano da quell'insieme.
- **Limite noto, invariato.** Senza analisi per errore, una congiunzione (`all(...)`) è a livello di finestra: dice
  che nella finestra ci sono righe che soddisfano ciascun ramo, non che appartengono alla stessa richiesta. È il
  comportamento di oggi. Dove la correlazione per richiesta conta, la dà l'analisi per errore (§3.3).
- **`RunbookExecutionResult.matchedCases` diventa `detections`**: `ReadonlyArray<KnownCaseDetection>`, in ordine di
  tempo.
- **Azioni**: il motore esegue l'azione di ogni rilevazione, in ordine di tempo, ciascuna sul **contesto della sua
  rilevazione** (D6). Il fallback gira solo se non c'è nessuna rilevazione. Nel catalogo tutte le azioni sono `log`:
  oggi nessun caso usa `notify`, `escalate` o `update`.
- **`'resolve'` sparisce** da `FlowDirective` (D2), insieme a `EarlyResolutionTrace`, `earlyResolution` e
  `resolvedAtStep`. Gli step che lo emettono restituiscono `continue`. `stop` resta per i casi in cui la pipeline non
  ha davvero altro da fare: per esempio `ParseApiGwErrorsStep` con zero errori.
- **Traccia**: `CaseEvaluationTrace` perde `priority` e guadagna `firstSeenAt`, `lastSeenAt`, `evidenceCount`,
  `supersededBy` ed `errorKey`. `CaseMatchingTrace.matchedCaseIds` segue l'ordine delle rilevazioni.

### 3.3 L'analisi per errore (SEND API Gateway, Lambda, service e downstream)

Per le tre famiglie del §1.3 si analizza **ogni errore** della finestra, non uno solo (D1).

**Il costrutto.** Uno step "enumeratore" restituisce gli errori trovati e dice se li ha visti tutti:

```typescript
interface DetectedError {
  readonly occurredAt: string; // ISO-8601 UTC
  readonly key: string; // requestId, trace id, …: identifica l'errore nel risultato
  readonly vars: Readonly<Record<string, string>>;
  /** Le righe di evidenza di questo errore soltanto (per esempio la sua riga dell'access log). */
  readonly rows: ReadonlyArray<unknown>;
}

interface ErrorEnumeration {
  readonly errors: ReadonlyArray<DetectedError>; // in ordine di occurredAt
  /** false se la query ha restituito tanti risultati quanto il suo limite: altri errori possono mancare. */
  readonly complete: boolean;
}
```

Il builder divide la pipeline in due parti:

- **una parte di finestra**, che gira una volta sola e i cui output sono condivisi in sola lettura (query dell'access
  log, sonde a livello di finestra come quella della Lambda di versioning di B2B);
- **una parte per errore** (`perError([...steps])`), che il motore esegue una volta per errore.

**Come gira la parte per errore:**

- Il motore la esegue con il **proprio ciclo degli step** (lo stesso `executeSteps`, non `executeSubPipeline`), con
  un indice degli step limitato al blocco. Così valgono anche lì `goTo`, la protezione dai cicli, la diagnostica e
  `stop`, che però chiude solo l'iterazione.
- Ogni iterazione ha un **contesto isolato**: parametri, output e variabili della parte di finestra, più `vars` e
  `rows` dell'errore. Le variabili e gli output scritti in un'iterazione non passano alla successiva.
- I casi si valutano **per errore**, sul contesto dell'iterazione. Le condizioni sulle variabili scalari
  (`apiGwStatusIs('500')`, `lambdaErrorCategory`) restano valide così come sono. Se l'evidenza di un caso non ha
  tempo, il caso prende `occurredAt` dell'errore.
- Una **iterazione fallita** non ferma le altre. L'errore resta nel risultato come «analisi fallita», con lo step e il
  messaggio, e le rilevazioni già raccolte nelle altre iterazioni restano valide. L'esecuzione resta `completed`, e
  la bozza diventa `IN_PROGRESS` (§3.5).
- L'**annullamento** resta globale: un segnale di abort ferma tutte le iterazioni.

**Copertura della finestra.** Le query di enumerazione ordinano per `@timestamp asc`, così con il limite si perdono
gli errori più recenti e non i più vecchi. Se la query restituisce tante righe quanto il suo limite, l'enumerazione
è `complete: false`: l'output dice «almeno N errori», non un totale esatto, e lo stato proposto diventa
`IN_PROGRESS`. Niente paginazione in questa specifica: la saturazione si dichiara, non si nasconde.

**Le famiglie:**

- **SEND API Gateway (F2).** `ParseApiGwErrorsStep` diventa l'enumeratore: un errore per ogni richiesta in errore
  dell'access log, con la sua riga, in ordine di tempo e senza l'ordinamento per gravità. La query dell'access log
  ordina per `@timestamp asc`. `EvaluateApiGwAuthorizerFailureStep` e `QueryApiGwExecutionLogsStep` diventano per
  errore e leggono solo la riga dell'errore attivo. L'execution log resta una sola query per finestra (la clausola
  `OR` sui requestId esiste già), e il risultato si divide per requestId fra gli errori. La traversata dei servizi
  gira per errore. Le sonde di finestra (versioning B2B, che supporta anche richieste senza correlation id) restano
  nella parte di finestra: sono evidenza di finestra, non della richiesta.
- **Lambda (F3).** L'enumeratore raggruppa le righe d'errore per invocazione:
  - prima `@requestId`, poi il requestId ricavato dal messaggio, come fa oggi `scanLambdaLogs`;
  - ogni invocazione ha la sua categoria (`timeout`, `out-of-memory`, …);
  - le righe senza requestId formano un errore «non attribuito», esplicito;
  - nelle varianti multi-account (`QueryLambdaAcrossAccountsStep`) la chiave è sorgente più requestId, e la query
    delle invocazioni si fa sull'invocazione attiva, oppure in un lotto diviso per quella chiave.

  `lambdaLogEvidenceMatches` legge così le righe dell'invocazione, non della finestra.

- **SEND service e downstream (F4).** L'enumeratore raggruppa per trace id le righe d'errore dei log applicativi. Una
  riga senza trace id è un errore a sé, con il suo messaggio. `QueryServiceTraceLogsStep` gira per errore sul suo
  trace. Così il messaggio d'errore e l'eccezione del trace appartengono alla stessa richiesta.

**Altre regole:**

- **Limite** (D8). Al massimo N errori per esecuzione, i più vecchi per primi (proposta: 20, configurabile per
  runbook). Il troncamento non è mai silenzioso: l'output dice «analizzati 20 errori su 57» (o «su almeno 1000») e lo
  stato proposto diventa `IN_PROGRESS`.
- **Errori senza caso.** Un errore enumerato che non corrisponde a nessun caso resta nel risultato come errore non
  riconosciuto, con il suo tempo.
- **Costo.** Le query ai servizi si moltiplicano per il numero di errori. Prima del rilascio di F2, F3 e F4 si misura
  con `go-rta-check` su occorrenze reali, in sola lettura: query, durata, righe scansionate, prima e dopo. Se serve,
  si ottimizza raggruppando in una sola query per servizio i trace id di più errori e dividendo il risultato per trace
  id. L'ottimizzazione resta fuori finché le misure non la chiedono.

Le famiglie interop k8s e interop API GW non hanno l'enumeratore: le loro rilevazioni prendono il tempo dalle righe o
dagli aggregati (§3.2). Durante lo sviluppo si verifica che nessuno dei loro step riduca l'evidenza a una sola riga
prima dei casi.

### 3.4 L'output del runbook

`RunbookOutput.schemaVersion` passa a `2.0.0`. La costante si esporta da `go-runbook`, e i lettori la usano invece di
ripeterla (§3.7).

- `outcome.kind: 'known-case-matched'` perde `primaryCaseId`, `primaryCaseDescription` e `matchedCases[].priority`.
  Guadagna `detections[]`, in ordine di tempo, con questi campi:
  - `caseId`, `description`, `firstSeenAt?`, `lastSeenAt?`, `evidenceCount`;
  - `errorKey?` e i **campi di correlazione** dell'errore: requestId e trace id, quando ci sono, limitati in lunghezza;
  - `resolvedMessage`, reso dal contesto della rilevazione, per ogni caso e non più solo per il primo.
- **Copertura** (sempre presente, anche in F1): `errors` con `total` (o `atLeast` se l'enumerazione è satura),
  `analyzed`, `unrecognized`, `failed` e `unexamined`. In F1, nelle famiglie del §1.3, `unexamined` sono le richieste
  o invocazioni in errore oltre quella rappresentativa: per esempio `apiGwErrorCount - 1`.
- Con l'analisi per errore: `errors.items[]` con `occurredAt`, `key`, campi di correlazione, stato (`recognized`,
  `unrecognized`, `failed`) e le rilevazioni dell'errore.
- Messaggio: «Individuato caso noto: …» se il caso è uno, «Individuati N casi noti: …» se sono di più.
- `execution.earlyResolution` e `execution.resolvedAtStep` spariscono.

### 3.5 La bozza per Watchtower

Il contratto `AnalysisDraftV1` di Watchtower resta com'è (D4): un'analisi per occorrenza, campi di testo di al massimo
5.000 caratteri, bozza serializzata entro 64 KiB (`ANALYSIS_DRAFT_BOUNDS.DRAFT_BYTES`), `additionalProperties: false`.

Un'analisi è **completa** quando non ci sono errori non riconosciuti, falliti o non esaminati, e l'enumerazione non è
né troncata né satura.

- **Una rilevazione e analisi completa**: la bozza è identica a quella di oggi. Si verifica con le fixture attuali.
- **Negli altri casi con almeno una rilevazione** (`KNOWN_CASE`):
  - `conclusionNotes` è un elenco numerato in ordine di tempo, con una voce per caso:
    `1. 2026-11-19 10:15:42 UTC — <descrizione>: <risoluzione resa dal contesto della rilevazione>`, più
    `(N volte fino alle …)` quando il caso si ripete;
  - in fondo, una riga per ciò che manca: «Senza caso noto: K errori», «Analisi fallita: K errori», «Non esaminati:
    K errori» (o «almeno K»);
  - `errorDetails` unisce i dettagli dei casi in ordine di tempo.
- **`proposedStatus`** (D5): `COMPLETED` solo se l'analisi è completa e **tutte** le rilevazioni sono `COMPLETED`;
  altrimenti `IN_PROGRESS`. È la regola delle fasce 200/500 del §1.4, scritta in chiaro e valida per tutti i runbook.
  In F1 vale la scelta D10 sugli errori non esaminati.
- **`analysisType`** (D5): `IGNORABLE` solo se l'analisi è completa e **tutte** le rilevazioni sono `IGNORABLE` con lo
  stesso `ignoreReasonCode` e gli stessi `ignoreDetails`; altrimenti `ANALYZABLE`, senza campi di ignore.
- **Liste** (`resources`, `downstreams`, `finalActions`, `links`): unione come oggi, prima i default e poi i casi in
  ordine di tempo, senza duplicati.
- **Nessuna rilevazione**: `UNKNOWN_CASE_CONTEXT`, invariato e valido per lo schema v1. Troncamento, saturazione e
  fallimenti stanno nell'output del runbook (§3.4) e nel riepilogo di completamento, non nella bozza, che non ha campi
  per dirlo.
- **Misura a runtime.** La bozza si compone e poi si misura com'è sul filo, cioè JSON in UTF-8, contro tutti i limiti:
  5.000 caratteri per campo e 64 KiB in totale. Prima si riservano i campi obbligatori, le liste e la riga di
  troncamento; poi si aggiungono voci intere, in ordine di tempo, finché ci stanno. L'ultima riga diventa «… e altri K
  casi (vedi l'esecuzione)». Le liste restano entro i 64 elementi come oggi. Questo vale anche nell'adattatore di
  completamento, prima dell'invio.
- **Validazione statica** (`buildPotentialAnalysisDrafts`, `assertAnalysisAnnotations`): il caso peggiore diventa
  "tutti i casi annotati insieme", senza ordinamento per priorità. Per le liste è già così oggi, perché il primo caso
  si unisce a tutti i successivi. Il limite statico resta sulla singola risoluzione. I testi composti si governano a
  runtime.

### 3.6 Il catalogo

1. **Togliere `priority`** dai 302 casi del catalogo, dai 4 dei toolkit e dalle factory interop
   (`createInteropApiGwKnownCaseFactory`, `interopK8sKnownCase`) e da `KnownCaseSpec`. È una modifica meccanica.
2. **Rivedere le sovrapposizioni.** Si eseguono i test di tutti i runbook e si elencano le fixture in cui corrisponde
   più di un caso. Per ciascuna si sceglie fra tre strade:
   - sono due errori diversi, ed è giusto vederli entrambi;
   - è lo stesso errore, e si usa `supersedes`;
   - la condizione è sbagliata, e si corregge.

   Già noti:
   - il timeout di `pn-delivery-insert-trigger-eb-lambda` → `supersedes: ['lambda-timeout']`;
   - in `workday-pn-external-channel-alb-alarm`, `duplicated-event-400-02` → `supersedes: ['duplicated-event-err-cons']`;
   - i casi «500 senza log correlati» → da verificare, perché alcuni sono già esclusivi grazie a `not(varExists(...))`.

   Restano come sono le 7 condizioni con `not(...)`, il condizionamento del BFF InfoPa e i casi dell'authorizer.

3. **Le fasce 200/500** e il loro commento si tolgono: la regola diventa quella del §3.5.
4. **`'resolve'`**: i 5 step del catalogo e i 5 dei toolkit restituiscono `continue`.
5. **Tempo nelle query di evidenza**: un controllo alla registrazione verifica che ogni query usata come evidenza dei
   casi proietti `@timestamp`, oppure `firstTimestamp` e `latestTimestamp` se aggregata. Le query che non lo fanno si
   correggono.
6. **Baseline**: `__baseline__/canonical.json` e `fingerprints.json` si rigenerano (la priorità entra nell'impronta di
   ogni runbook con casi), e cambia il `definitionDigest`. Non serve migrare nessun catalogo: il catalogo automatico
   non è mai stato rilasciato.

### 3.7 Chi legge i risultati

| Chi                                                                                                   | Che cosa cambia                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/go/go-analyze-alarm` (`analyzeOccurrence`, `renderFinalSummary`)                             | elenco cronologico con copertura; niente «priority N» né caso primario                                                                                                                                                                                                                                  |
| `packages/go-watchtower-runbook` (`matchAnalysis`, `matchAnalysisAi`, `checkOccurrence`)              | il confronto con l'analisi umana considera **tutte** le rilevazioni. L'accordo «esatto» sul trace si dà solo se la rilevazione porta lo stesso requestId o trace id dell'analisi umana, non per una corrispondenza a livello di occorrenza                                                              |
| `packages/go-watchtower-runbook` (`cache/runbookFingerprint.ts`)                                      | `EXPECTED_OUTPUT_SCHEMA_VERSION` (oggi `'1.0.0'`, ripetuto a mano) legge la costante esportata da go-runbook. Entra già nell'impronta, quindi le voci in cache della v1 vengono scartate                                                                                                                |
| `packages/go-watchtower-runbook` (`check/buildReport.ts`)                                             | lo `schemaVersion` del report RTA passa da `1.1.0` a `2.0.0`, con tipi e fixture aggiornati                                                                                                                                                                                                             |
| `scripts/go/go-rta-check` (`renderConsole`, `writeReport`)                                            | colonne e report con l'elenco delle rilevazioni e la copertura al posto di `primaryCaseId`                                                                                                                                                                                                              |
| `scripts/go/go-execute-runbook` (`executeRunbook`, `toCompleteAnalysisDraft`, `buildTrackingEntries`) | si adegua alla bozza (misura a runtime del §3.5) e all'outcome nuovi; le voci di tracking diventano per errore, con i campi di correlazione. Oppure si elimina prima con la catena descritta in [DRAFT-001](../../drafts/DRAFT-001-ExecuteRunbookRemoval/DRAFT-001-ExecuteRunbookRemoval-CLAUDE-v01.md) |
| Reporter dei toolkit (`ApiGwServiceChainReporter`, `LambdaReporter`, `renderApiGwFinalSummary`)       | niente «← primario»; elenco con i tempi e, per errore, la sua traversata                                                                                                                                                                                                                                |
| Lambda dei runbook in go-watchtower (repository a parte)                                              | legge `RunbookOutput` 2.0.0 e la bozza, e applica la stessa misura a runtime prima dell'invio; il contratto della bozza non cambia (D4)                                                                                                                                                                 |

### 3.8 Documentazione e rilascio

- `docs/RUNBOOKENGINE.md` (28 passaggi su priorità e risoluzione anticipata, compreso l'esempio didattico),
  `docs/ARCHITECTURE.md` (3) e il README di `go-runbook`.
- Un changeset per `@pagopa/go-runbook` che descrive la modifica incompatibile. Il repository è in pre mode `next`,
  quindi esce come `1.0.0-next.N`.
- Gli artefatti storici di `artifacts/runbook-automation/remediation/2026-10-17/` non si toccano.

### 3.9 Le fasi

Ogni fase si chiude con `pnpm check` verde.

1. **F1: i casi.** Motore (§3.2), output con copertura (§3.4), bozza (§3.5), catalogo (§3.6), consumatori (§3.7),
   aggregati interop, documentazione. Basta da sola per interop k8s e interop API GW. Per le famiglie del §1.3
   riporta tutti i casi presenti nell'evidenza raccolta, ma su un solo errore, e dichiara gli altri come non
   esaminati. Per coerenza col tempo, l'errore rappresentativo di API GW diventa il più vecchio invece del più grave.
2. **F2: analisi per errore, SEND API Gateway** (§3.3), con la misura dei costi su occorrenze reali.
3. **F3: analisi per errore, Lambda**, comprese le varianti multi-account.
4. **F4: analisi per errore, SEND service e downstream.**

## 4. Test e verifica

- **Motore**:
  - valutazione nell'ordine di dichiarazione;
  - ordine cronologico, parità di tempo e rilevazioni senza tempo;
  - `supersedes`: rimozione per ambito, traccia ed errori di validazione;
  - esecuzione di tutte le azioni nell'ordine, ciascuna resa dal suo contesto;
  - nessuna traccia di `'resolve'` nei tipi né nel motore.
- **Valutatore**:
  - minimo e massimo su più di 10 righe che corrispondono, con righe ordinate `desc`;
  - `pattern` su tutte le righe;
  - una riga che soddisfa due rami di un `or` conta una volta sola;
  - `not` non porta evidenza;
  - righe aggregate con `count`, gruppi ripetuti e intervalli che si sovrappongono;
  - righe senza tempo;
  - formato del tempo Logs Insights (`2026-11-19 10:15:42.123`) normalizzato in UTC.
- **Bozza**:
  - una rilevazione con analisi completa, uguale alle fixture di oggi;
  - una rilevazione `COMPLETED` più un errore non riconosciuto, fallito o non esaminato → `IN_PROGRESS` e riga di
    copertura;
  - più casi: note, regole di stato e di tipo, motivi di ignore diversi;
  - nessuna rilevazione con troncamento → `UNKNOWN_CASE_CONTEXT` valido per lo schema;
  - misura a runtime con testo multibyte e caratteri da escapare: la bozza serializzata resta entro 64 KiB e ogni
    campo entro 5.000;
  - le fixture di `contracts/runbook-automation/v1/owned/fixtures/` validano ancora contro lo schema di Watchtower.
- **Analisi per errore**:
  - isolamento di variabili e output tra iterazioni;
  - `goTo` e `stop` dentro il blocco;
  - iterazione fallita seguita da iterazioni riuscite;
  - abort globale;
  - casi su variabili scalari valutati per errore;
  - limite, saturazione e troncamento dichiarati;
  - traccia per iterazione.
- **Analisi per errore, scenari di famiglia**:
  - **API GW**: una finestra con un timeout dell'authorizer sulla richiesta A e un errore di servizio sulla richiesta
    B; ciascuno si attribuisce alla sua richiesta, con i suoi metadati;
  - **Lambda**: due timeout con `lambdaRequestId` diversi rendono due messaggi diversi e corretti; righe senza
    `@requestId` ma con il requestId nel messaggio; righe senza requestId → errore «non attribuito»; le due varianti
    multi-account;
  - **SelfcarePG**: errore vuoto e timeout sullo stesso trace, e su trace diversi, anche in ordine inverso;
  - **Workday**: il trace A con il solo `ERR_CONS_DUPLICATED_EVENT` e il trace B con tutti e tre i marcatori.
- **Catalogo**:
  - test di tutti i runbook aggiornati;
  - elenco delle sovrapposizioni rivisto voce per voce e allegato al registro della specifica;
  - controllo del tempo sulle query di evidenza;
  - baseline rigenerate.
- **Lettori**:
  - le voci di cache della v1 vengono scartate;
  - i report RTA vecchi e nuovi si distinguono per versione;
  - l'accordo «esatto» richiede lo stesso requestId o trace id.
- **Verifica reale, in sola lettura**: `go-rta-check` su occorrenze recenti dei runbook API GW, Lambda, service,
  downstream e interop, prima e dopo. Si confrontano casi trovati, ordine, copertura, query, durata e accordo con le
  analisi umane in Watchtower.
- **Gate**: `pnpm check` e `pnpm lint`, compresi `check:published` e `check:published:sources` per il package
  pubblicato.

## 5. Fuori da questa specifica

- **Un contratto Watchtower v2** con un elenco strutturato di casi (`cases[]`) e campi di copertura al posto delle note
  composte. Vale se si vuole che Watchtower mostri e filtri i singoli casi. Richiede lavoro nel repository
  go-watchtower (D4).
- **La paginazione o il partizionamento nel tempo** delle query di enumerazione. In questa specifica la saturazione si
  dichiara (§3.3).
- **Il raggruppamento delle query per trace id** nell'analisi per errore, finché le misure non lo chiedono (§3.3).
- **Il raggruppamento degli errori per firma** (stesso status, path e messaggio), analizzando un solo errore per
  gruppo. Riduce le query, ma ripropone un errore "rappresentativo": due richieste con la stessa firma possono avere
  cause diverse a valle. È l'alternativa a D8.
- **Le righe di errore che nessun caso spiega** nelle famiglie senza enumeratore (interop). Contarle richiede di
  distinguere le righe d'errore da quelle di contesto, query per query. Si riprende dopo aver visto i risultati reali
  di F1 (D9, rimandata).
- **La correlazione per richiesta delle congiunzioni** nelle famiglie senza enumeratore (§3.2, limite noto).
- **Le azioni `notify`, `escalate`, `update` e `composite`**: nessun caso del catalogo le usa. Toglierle è una pulizia
  a parte.
- **La priorità degli allarmi** in Watchtower e in `go-watchtower-client`: è un'altra cosa e non si tocca.

## 6. Le scelte del committente

- **D1 · Fin dove arrivare.**
  - (a) Solo i casi (F1): tutti i casi noti sull'evidenza raccolta, ma API GW, Lambda, service e downstream continuano
    ad analizzare un errore solo, e dichiarano gli altri come non esaminati.
  - (b) Casi più analisi per errore (F1–F4): tutti gli errori della finestra.

  **Proposta: (b)**, a fasi, con F1 rilasciabile da sola. Solo con (b) "tutti gli errori" vale anche per i 36
  runbook delle famiglie del §1.3.

- **D2 · La risoluzione anticipata.** Toglierla del tutto, oppure tenerla come ottimizzazione. **Proposta: toglierla.**
  Se la pipeline si ferma al primo caso trovato, non si possono avere tutti gli errori. Dove la pipeline non ha
  davvero altro da fare c'è già `stop`.
- **D3 · Sovrapposizioni tra casi.**
  - (a) `supersedes` sul caso, nell'ambito dell'errore o dell'esecuzione;
  - (b) solo `not(...)` nelle condizioni, come già fanno 7 casi;
  - (c) un flag `catchAll` (il caso si riporta solo se non ne corrisponde nessun altro).

  **Proposta: (a).** Copre sia il caso generico sia la sostituzione di un caso condiviso, il builder la valida e non
  allunga le condizioni. Con l'analisi per errore la sostituzione resta dentro la richiesta, e non cancella errori di
  altre richieste. (b) resta disponibile. (c) non copre la sostituzione.

- **D4 · Il contratto della bozza.** Tenere `AnalysisDraftV1` e comporre le note in ordine di tempo, oppure aprire una
  v2 con `cases[]` in go-watchtower. **Proposta: tenere la v1.** Nessun lavoro nell'altro repository, e con un caso
  solo e analisi completa la bozza non cambia.
- **D5 · Stato e tipo con più casi.** Regole del §3.5: `COMPLETED` e `IGNORABLE` solo con analisi completa e tutti i
  casi concordi. **Proposta: queste regole.** Sostituiscono le fasce 200/500 senza perdere la garanzia che un caso
  benigno non nasconda lavoro da fare.
- **D6 · Le azioni.** Eseguire le azioni di tutte le rilevazioni in ordine di tempo, oppure solo della prima in ordine
  di tempo. **Proposta: tutte**, ciascuna sul suo contesto. Nel catalogo sono solo `log`, e l'operatore deve vedere
  ogni caso.
- **D7 · Rilevazioni senza tempo.** In fondo all'elenco, nell'ordine di dichiarazione. **Proposta: sì.** Con (b) di D1
  restano solo i casi su variabili fuori dall'analisi per errore.
- **D8 · Il limite dell'analisi per errore** (solo con D1 (b)). **Proposta: 20 errori per esecuzione**, i più vecchi
  per primi, configurabile per runbook, con troncamento dichiarato e `IN_PROGRESS`. L'alternativa è il raggruppamento
  per firma del §5.
- **D9 · Righe di errore non spiegate** nelle famiglie senza enumeratore. **Rimandata** (§5): si riprende dopo F1, sui
  risultati reali.
- **D10 · Gli errori non esaminati in F1.** In F1 le famiglie del §1.3 analizzano ancora un errore solo e dichiarano
  gli altri come non esaminati. Le opzioni sono due:
  - (a) contarli solo come informazione, nell'output e nelle note, senza effetto sullo stato: è il comportamento di
    oggi, reso visibile;
  - (b) forzare subito `IN_PROGRESS` quando ce ne sono.

  **Proposta: (a)** se F2–F4 seguono a breve, perché (b) toglierebbe la chiusura automatica a molte occorrenze che
  oggi la hanno. **(b)** se F1 resta a lungo da sola.
