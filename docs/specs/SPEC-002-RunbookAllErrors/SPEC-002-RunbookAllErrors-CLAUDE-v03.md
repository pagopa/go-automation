# SPEC-002 · Runbook Automation: tutti gli errori, in ordine di tempo — v03

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: la richiesta del committente del 19 novembre 2026
- Revisione: la v03 recepisce il secondo giro di revisione di Codex. Il committente ha scelto di tenere in questa
  specifica anche l'analisi per errore. Rilievi e decisioni sono nel registro.

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

### 1.3 Le famiglie SEND scelgono un solo errore prima ancora dei casi

Togliere la priorità dai casi non basta. Le famiglie SEND riducono l'evidenza a **un errore rappresentativo** prima
che i casi vengano valutati:

- **API Gateway** (`createSendApiGwAlarmRunbook`, 9 runbook).
  - La query dell'access log ordina per gravità
    (`sort status desc, authorizerStatus desc, integrationServiceStatus desc, @timestamp asc | limit 1000`).
  - `ParseApiGwErrorsStep` tiene solo la prima riga. Status, path, messaggio e trace id finiscono in variabili
    scalari (`apiGwStatusCode`, `apiGwErrorMessage`, `xRayTraceId`, …).
  - `QueryServiceLogsStep` interroga i servizi **con quel solo trace id**.
  - Anche gli altri lettori dell'access log lavorano sulla finestra intera:
    - lo step dell'authorizer cerca un timeout in qualunque riga;
    - lo step dell'execution log riscrive status, path, trace e `apiGwErrorCount` con la prima richiesta che ha un
      messaggio d'errore;
    - gli hook di Stream (`QueryStreamLambdaLogsStep`) leggono direttamente `query-api-gw-logs`.
- **Lambda** (`createSendLambdaAlarmRunbook`, 12 runbook).
  - La query degli errori è `sort @timestamp desc | limit 1000`.
  - `scanLambdaLogs` dà una categoria sola a tutta la finestra (`timeout` vince su tutto) e un messaggio
    rappresentativo. `lambdaErrorCount` conta righe, non invocazioni.
  - Le varianti multi-account (DailyExport, downstream-monitoring, `QueryLambdaAcrossAccountsStep`) sostituiscono
    entrambe le query. La query delle invocazioni costruisce le richieste dall'intero output degli errori, e una
    sorgente che raggiunge 1.000 righe fa fallire lo step.
  - Il percorso standard interpola il requestId nel predicato CloudWatch senza la validazione che usa la variante
    multi-account.
- **Service e downstream** (`createSendServiceAlarmRunbook` 4 e `createDownstreamAlarmRunbook` 11, entrambi su
  `createServiceAlarmRunbook`).
  - `scanApplicationLogs` sceglie il messaggio più recente come rappresentativo e, a parte, il primo trace id valido.
  - `QueryServiceTraceLogsStep` interroga solo quel trace.
  - Un caso come `selfcarepg-read-timeout-with-empty-error` (`personal-data-vault-SelfcarePG-downstream-detection-Alarm`)
    unisce il messaggio rappresentativo e la query sul trace. Se l'errore vuoto e il timeout stanno su trace diversi,
    o se sullo stesso trace c'è un altro errore più recente, il caso si perde oppure unisce i sintomi di due errori.
- **Pipeline SEND autonome**: `spidhub-prod-ExternalELBAlarm` e `pn-logsaver-be-FailedInvocation-Alarm` non usano i
  builder. SPID Hub conta le righe d'errore e dichiara manuale la correlazione con l'ALB. Logsaver conta gli errori
  che non spiega e ha un caso (interruzioni Spot) basato solo su variabili.

In tutto **26 delle circa 245 condizioni** del catalogo si basano solo su variabili scalari, senza righe di log come
evidenza. Sono quasi tutte API GW e Lambda.

### 1.4 Interop: tutte le righe, ma con limiti che nessuno dichiara

Le famiglie interop k8s e interop API GW confrontano i casi con **tutte** le righe della query
(`stepEvidenceMatches`, cioè `contains` con regex sull'output dello step). Però:

- interop API GW e i warning di servizio lavorano su **righe aggregate**: `count` e `latestTimestamp` per gruppo. La
  query ordina per `count desc` prima del limite, e `QueryInteropApiGwAggregatesStep` copia `latestTimestamp` in
  `@timestamp`. Un gruppo di sette errori tra le 10:00 e le 10:20 oggi ha solo «10:20». Se la query satura, i gruppi
  rari spariscono;
- il tracker dei CID tronca i CID ed espone `SkippedCidCount`, ma nessuno lo usa per dire che l'analisi è parziale;
- il BFF (`AnalyzeBffEvidenceStep`) e il tracker trasformano le righe in oggetti derivati (`{ servizio, messaggio,
cid }`, `{ cid, rows }`) che perdono il tempo.

### 1.5 La priorità porta significati che nessuno dichiara

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

### 1.6 Il tempo non è un dato del motore

Le righe di CloudWatch portano `@timestamp` quando la query lo proietta, e la condizione le confronta come testo
intero. Ma:

- il motore non ha un campo "quando" né per l'evidenza né per i casi;
- `pattern` si ferma alla prima riga che corrisponde, e `contains` con regex conserva nella traccia solo 10 righe di
  esempio;
- le query ordinano a volte `asc`, a volte `desc`, a volte per gravità o per conteggio: la prima riga trovata non è la
  più vecchia;
- con `limit` dopo quegli ordinamenti, gli errori più vecchi o più rari possono non arrivare affatto, e nessuno lo
  dice;
- le variabili scalari (`vars.*`) e molti oggetti derivati non hanno tempo.

Oggi quindi non si può ordinare per tempo neanche ciò che già si trova, né sapere se si è visto tutto.

## 2. Che cosa vede chi usa il repository

- **Chi analizza un allarme** (console di `go-analyze-alarm` e `go-rta-check`) vede l'elenco di tutti i casi noti
  individuati, dal più vecchio al più recente. Per ciascuno vede:
  - la prima e l'ultima volta in cui si è visto;
  - quante righe di evidenza lo sostengono;
  - la richiesta (requestId o trace id), quando c'è.

  Vede anche la copertura: gli errori senza caso, quelli la cui analisi è fallita, quelli non esaminati, e le fonti
  di evidenza incomplete. Non c'è più un caso "primario".

- **Watchtower** riceve ancora **un'analisi per occorrenza**. Se l'analisi è completa e trova un caso solo, la bozza
  resta identica a oggi. Negli altri casi `conclusionNotes` elenca i casi in ordine di tempo e la copertura, e stato
  e tipo seguono regole esplicite (§3.6) invece della priorità.
- **Chi scrive un runbook** non dichiara più `priority`. Quando due casi descrivono lo stesso errore, lo dice con
  `supersedes` (§3.2). Non esiste più `next: 'resolve'`. Uno step che non vede tutta l'evidenza lo dichiara con
  `coverage` (§3.3).
- **Chi rilascia**: è una modifica incompatibile di `@pagopa/go-runbook`, ancora in prerelease (`next`). La Lambda di
  go-watchtower che importa il package va adeguata insieme (§3.8).

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
  /** Righe di evidenza che sostengono il caso; una riga aggregata vale il suo `count`. Non è un numero di errori. */
  readonly evidenceRows: number;
  /** Errore a cui appartiene, quando l'analisi è per errore (§3.4). */
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
- **`supersedes?: readonly string[]`** sul caso (D3).
  - Se il caso X corrisponde, i casi elencati in `X.supersedes` **nello stesso ambito** si tolgono dalle rilevazioni.
    Restano nella traccia con `supersededBy: 'X'`.
  - L'ambito è l'errore con l'analisi per errore, altrimenti l'esecuzione.
  - Il builder rifiuta id inesistenti, un caso che sostituisce sé stesso e i cicli (`UNKNOWN_SUPERSEDED_CASE`,
    `SUPERSEDES_CYCLE`).
  - Vuol dire "X è una spiegazione più precisa dello stesso errore". Si usa solo quando i due casi descrivono davvero
    lo stesso errore **e** l'ambito garantisce che parlino della stessa richiesta (§3.7, punto 2). Due errori diversi
    restano due rilevazioni.
- **Il tempo dell'evidenza.** `RunbookEngineOptions` riceve un lettore iniettato, come oggi riceve il
  `logActionRenderer`:

  ```typescript
  type EvidenceTimeReader = (
    element: unknown,
  ) => { readonly first: number; readonly last: number; readonly weight: number } | undefined;
  ```

  Così il motore non conosce il formato delle righe CloudWatch. Il toolkit comune fornisce il lettore, che riconosce
  tre forme:

  | Forma dell'elemento    | Tempo                                             | Peso    |
  | ---------------------- | ------------------------------------------------- | ------- |
  | Riga semplice          | `@timestamp` (o `timestamp`), normalizzato in UTC | 1       |
  | Riga aggregata         | `firstTimestamp` e `latestTimestamp`              | `count` |
  | Gruppo (`{ …, rows }`) | minimo e massimo delle sue righe                  | righe   |

  Gli step che trasformano righe in oggetti derivati (BFF interop, tracker dei CID) conservano `@timestamp` nella
  forma derivata, o le righe del gruppo. Le query aggregate di interop (access log e warning di servizio) aggiungono
  `earliest(@timestamp) as firstTimestamp`.

- **Valutazione.** Nella valutazione dettagliata il `ConditionEvaluator` raccoglie, per ogni predicato su un array, gli
  **indici** di tutte le righe che corrispondono, non solo i 10 campioni della traccia. `pattern` in modalità
  dettagliata non si ferma più alla prima riga: il costo resta O(N), come `contains`. L'evidenza di un caso si prende
  **solo dai rami logicamente soddisfatti**:
  - `and` soddisfatto: l'unione dei suoi rami;
  - `or`: solo i rami soddisfatti, così una regex dentro un ramo con un vincolo d'ambiente falso non porta evidenza;
  - `not`: nessuna evidenza.

  L'insieme è senza duplicati per `(ref, indice)`, quindi una riga che soddisfa più rami conta una volta. Righe
  uguali restituite da due query diverse (per esempio la scansione degli errori Lambda e la ricostruzione
  dell'invocazione) restano due righe di evidenza. Per questo il conteggio si chiama `evidenceRows` e non si
  presenta mai come «N volte».

- **Limite noto, invariato.** Senza analisi per errore, una congiunzione (`all(...)`) è a livello di finestra: dice
  che nella finestra ci sono righe che soddisfano ciascun ramo, non che appartengono alla stessa richiesta. È il
  comportamento di oggi. Dove la correlazione per richiesta conta, la dà l'analisi per errore (§3.4).
- **`RunbookExecutionResult.matchedCases` diventa `detections`**: `ReadonlyArray<KnownCaseDetection>`, in ordine di
  tempo.
- **Azioni**: il motore esegue l'azione di ogni rilevazione, in ordine di tempo, ciascuna sul **contesto della sua
  rilevazione** (D6). Il fallback gira solo se non c'è nessuna rilevazione. Nel catalogo tutte le azioni sono `log`:
  oggi nessun caso usa `notify`, `escalate` o `update`.
- **`'resolve'` sparisce** da `FlowDirective` (D2), insieme a `EarlyResolutionTrace`, `earlyResolution` e
  `resolvedAtStep`. Gli step che lo emettono restituiscono `continue`. `stop` resta per i casi in cui la pipeline non
  ha davvero altro da fare: per esempio `ParseApiGwErrorsStep` con zero errori.
- **Traccia**: `CaseEvaluationTrace` perde `priority` e guadagna `firstSeenAt`, `lastSeenAt`, `evidenceRows`,
  `supersededBy` ed `errorKey`. `CaseMatchingTrace.matchedCaseIds` segue l'ordine delle rilevazioni.

### 3.3 La copertura

Uno step che non vede tutta l'evidenza che dovrebbe lo dichiara nel suo risultato, invece di lanciare un errore o
tacere:

```typescript
interface StepCoverage {
  /** false se l'evidenza di questo step è parziale. */
  readonly complete: boolean;
  /** 'saturated' (righe = limite), 'unavailable' (sorgente non leggibile), 'skipped' (elementi scartati), 'manual' (correlazione non automatica). */
  readonly reason?: 'saturated' | 'unavailable' | 'skipped' | 'manual';
  readonly detail?: string; // per esempio «sorgente core: 1000 righe», «12 CID saltati»
}
```

`StepResult.coverage` è facoltativo e vale `complete: true` se manca. Il motore raccoglie le dichiarazioni di tutta
l'esecuzione (e di ogni iterazione, §3.4) nella **copertura** del risultato. In più ci sono i conteggi degli errori,
nelle unità del §3.5.

Chi la dichiara:

| Step                            | Quando                                                           |
| ------------------------------- | ---------------------------------------------------------------- |
| Ogni query di evidenza          | righe restituite = limite della query (`saturated`)              |
| Query interop aggregate         | gruppi = limite (`saturated`)                                    |
| Tracker dei CID interop         | `SkippedCidCount > 0` (`skipped`)                                |
| `QueryLambdaAcrossAccountsStep` | per sorgente: satura o illeggibile dopo che altre hanno risposto |
| `QueryApiGwExecutionLogsStep`   | lotto saturo o evidenza `unavailable` in modalità `best-effort`  |
| SPID Hub                        | correlazione con l'ALB manuale (`manual`)                        |

`QueryLambdaAcrossAccountsStep` smette di lanciare un errore quando una sorgente satura. Tiene le righe di quella
sorgente e di tutte le altre e dichiara la sorgente satura. Le query aggregate interop ordinano per `latestTimestamp
desc` invece che per `count desc`, così una saturazione taglia i gruppi più vecchi e non quelli rari ma recenti; la
saturazione resta comunque dichiarata.

### 3.4 L'analisi per errore (SEND API Gateway, Lambda, service e downstream)

Per le famiglie del §1.3 si analizza **ogni errore** della finestra, non uno solo (D1).

#### Il costrutto

Uno step "enumeratore" restituisce gli errori trovati:

```typescript
interface DetectedError {
  readonly occurredAt: string; // ISO-8601 UTC
  readonly key: string; // requestId, trace id, …: identifica l'errore nel risultato
  readonly correlation: Readonly<Record<string, string>>; // requestId, traceId, sorgente: validati e limitati in lunghezza
  readonly vars: Readonly<Record<string, string>>;
  /**
   * Viste per errore degli output di finestra: nel contesto dell'iterazione `steps.<id>` restituisce
   * soltanto queste righe, non l'output intero dello step.
   */
  readonly scopedOutputs: Readonly<Record<string, ReadonlyArray<unknown>>>;
}

interface ErrorEnumeration {
  readonly errors: ReadonlyArray<DetectedError>; // in ordine di occurredAt
  readonly coverage: StepCoverage; // saturazione dell'enumerazione
}
```

Il builder divide la pipeline in due parti:

- **una parte di finestra**, che gira una volta sola e i cui output sono condivisi in sola lettura;
- **una parte per errore** (`perError([...steps])`), che il motore esegue una volta per errore.

Le **viste per errore** (`scopedOutputs`) sono il punto chiave. Tutti i lettori di un output di finestra che parla
di richieste (step, hook, condizioni dei casi) vedono, dentro l'iterazione, solo le righe dell'errore attivo. Così
`steps.query-api-gw-logs` letto dall'authorizer, dall'execution log o dagli hook di Stream non porta mai evidenza di
un'altra richiesta, e nessuno deve ricordarsi di filtrare.

#### Come gira la parte per errore

- Il motore la esegue con il **proprio ciclo degli step** (lo stesso `executeSteps`, non `executeSubPipeline`), con
  un indice degli step limitato al blocco. Così valgono anche lì `goTo`, la protezione dai cicli, la diagnostica e
  `stop`, che però chiude solo l'iterazione.
- Ogni iterazione ha un **contesto isolato**: parametri, output e variabili della parte di finestra, le viste per
  errore al posto degli output di finestra corrispondenti, `vars` e `correlation` dell'errore. Le variabili e gli
  output scritti in un'iterazione non passano alla successiva.
- I casi si valutano **per errore**, sul contesto dell'iterazione. Le condizioni sulle variabili scalari
  (`apiGwStatusIs('500')`, `lambdaErrorCategory`) restano valide così come sono. Se l'evidenza di un caso non ha
  tempo, il caso prende `occurredAt` dell'errore.
- Una **iterazione fallita** non ferma le altre. L'errore resta nel risultato come «analisi fallita», con lo step e
  il messaggio, e le rilevazioni delle altre iterazioni restano valide. L'esecuzione resta `completed`, ma l'analisi
  non è completa (§3.6).
- L'**annullamento** resta globale: un segnale di abort ferma tutte le iterazioni.
- **Letture di finestra memorizzate.** Uno step per errore può dichiarare la sua query come lettura di finestra
  (`windowRead`). Il motore la esegue al più una volta per esecuzione, alla prima iterazione che ne ha bisogno, e
  riusa il risultato nelle altre. La condizione che decide se serve resta valutata per errore. Così la sonda di
  versioning B2B resta dopo la traversata di `pn-delivery`, con il suo `apiGwStatusCode === '500'` e
  `deliveryLogCount === '0'` dell'errore attivo, ma la query parte una volta sola.
- **Visibilità del blocco.** `perError(...)` è uno step di controllo che espone enumeratore e blocco tramite
  `nestedSteps()`. Così `collectRunbookSteps` li vede, insieme a tutto ciò che si basa su di lui:
  - la preparazione dei servizi e degli account;
  - `assertCloudExecutableRunbook`, che rifiuta mutazioni e richieste HTTP non di sola lettura;
  - il digest della definizione.

#### Copertura dell'enumerazione

Le query di enumerazione ordinano per `@timestamp asc`. Così, se c'è un limite, si perdono gli errori più recenti e
non i più vecchi. Se la query satura, l'enumerazione dichiara `coverage.complete: false` e l'output dice «almeno N».
Niente paginazione in questa specifica: la saturazione si dichiara, non si nasconde.

#### Identificatori

Un modulo comune valida gli identificatori (requestId, trace id) con una allowlist, come fa già la variante
multi-account, e li rende nei predicati CloudWatch con l'escaping di `@pagopa/go-aws`. Lo usano l'enumerazione, la
query delle invocazioni, la query downstream e i metadati di traccia. Una riga con un identificatore non valido è
evidenza «non attribuita».

#### Le famiglie

- **SEND API Gateway (F2).**
  - `ParseApiGwErrorsStep` diventa l'enumeratore: un errore per ogni richiesta in errore dell'access log, in ordine
    di tempo, senza l'ordinamento per gravità. La sua vista di `query-api-gw-logs` è la sola riga della richiesta.
    La query dell'access log ordina per `@timestamp asc`.
  - `EvaluateApiGwAuthorizerFailureStep`, `QueryApiGwExecutionLogsStep` e gli hook che leggono l'access log
    (`QueryStreamLambdaLogsStep`) diventano per errore e leggono la vista.
  - L'execution log si interroga **dopo** la scelta degli errori ammessi (limite D8), a lotti di al più 50
    requestId. Le righe si attribuiscono per requestId esatto. Se un lotto satura, ogni richiesta del lotto ha
    evidenza incompleta; lo stesso vale per un `unavailable` in modalità `best-effort`.
  - Le variabili della diagnosi (`apiGwErrorMessage`, `apiGwStatusCode`, …) restano per richiesta, scritte
    dall'enumeratore. L'execution log scrive le sue in variabili proprie e non le sovrascrive.
  - La traversata dei servizi gira per errore. La sonda B2B è una lettura di finestra memorizzata.
- **Lambda (F3).**
  - L'enumeratore raggruppa le righe d'errore per invocazione: prima `@requestId`, poi il requestId ricavato dal
    messaggio, come fa oggi `scanLambdaLogs`.
  - Ogni invocazione ha la sua categoria (`timeout`, `out-of-memory`, …). Le righe senza requestId valido formano un
    errore «non attribuito», esplicito.
  - Nelle varianti multi-account la chiave è sorgente più requestId. La copertura si calcola per sorgente prima di
    fondere i risultati (§3.3). La query delle invocazioni si fa sull'invocazione attiva, oppure in un lotto diviso
    per quella chiave.
  - `lambdaLogEvidenceMatches` legge così le viste dell'invocazione, non della finestra.
- **SEND service e downstream (F4).**
  - L'unità è la **riga d'errore** dei log applicativi, non il trace. Ogni riga è un errore con il suo messaggio, e
    `scanApplicationLogs` non sceglie più un rappresentativo.
  - La query del trace (`QueryServiceTraceLogsStep`) è una lettura memorizzata per trace id: gli errori dello stesso
    trace la condividono.
  - Così il messaggio downstream vuoto e il `ReadTimeoutException` del suo trace appartengono allo stesso errore,
    anche se sullo stesso trace c'è un altro errore più recente.
- **SEND autonome (F4).**
  - SPID Hub e Logsaver restano a livello di finestra: non hanno un enumeratore. Usano i conteggi che hanno già per
    la copertura.
  - SPID Hub dichiara `manual` la correlazione con l'ALB.
  - Il caso Spot di Logsaver, solo su variabili, resta senza tempo (D7). Le diagnosi di finestra con righe di
    evidenza prendono l'intervallo da quelle righe.

#### Altre regole

- **Limite** (D8). Al massimo N errori per esecuzione, i più vecchi per primi (proposta: 20, configurabile per
  runbook). Il troncamento non è mai silenzioso: l'output dice «analizzati 20 errori su 57» (o «su almeno 1000»).
- **Errori senza caso.** Un errore enumerato che non corrisponde a nessun caso resta nel risultato come errore non
  riconosciuto, con il suo tempo.
- **Costo.** Le query ai servizi si moltiplicano per il numero di errori. Prima del rilascio di F2, F3 e F4 si misura
  con `go-rta-check` su occorrenze reali, in sola lettura: query, durata, righe scansionate, prima e dopo. Se serve,
  si ottimizza raggruppando in una sola query per servizio i trace id di più errori e dividendo il risultato per trace
  id. L'ottimizzazione resta fuori finché le misure non la chiedono.

### 3.5 L'output del runbook

`RunbookOutput.schemaVersion` passa a `2.0.0`. La costante si esporta da `go-runbook`, e i lettori la usano invece di
ripeterla (§3.8).

- `outcome.kind: 'known-case-matched'` perde `primaryCaseId`, `primaryCaseDescription` e `matchedCases[].priority`.
  Guadagna `detections[]`, in ordine di tempo, con questi campi:
  - `caseId`, `description`, `firstSeenAt?`, `lastSeenAt?`, `evidenceRows`;
  - `errorKey?` e i campi di correlazione dell'errore;
  - `resolvedMessage`, reso dal contesto della rilevazione, per ogni caso e non più solo per il primo.
- **Copertura** (sempre presente, anche in F1):
  - `unit`: l'unità di conteggio della famiglia. Vale `request` per API GW (requestId distinti), `invocation` per
    Lambda (invocazioni distinte), `errorRow` per service e downstream, `window` per le famiglie senza enumeratore;
  - `total` (o `atLeast` se l'enumerazione è satura), `analyzed`, `unrecognized`, `failed`, `unexamined`;
  - `sources[]`: le dichiarazioni `StepCoverage` incomplete, con step e motivo.

  In F1, nelle famiglie del §1.3, `total` si conta già nell'unità giusta: invocazioni distinte, non righe. È un
  valore immutabile della scansione, che nessuno step successivo riscrive. `unexamined` è `total - 1`.

- Con l'analisi per errore: `errors.items[]` con `occurredAt`, `key`, campi di correlazione, stato (`recognized`,
  `unrecognized`, `failed`), copertura dell'iterazione e rilevazioni dell'errore.
- `outcome.kind` aggiunge **`'inconclusive'`**: zero rilevazioni e analisi non completa per fallimenti o evidenza
  mancante. Lo distingue da `'unknown-case'` (analisi completa, nessun caso) e da un'esecuzione mai partita.
- Messaggio: «Individuato caso noto: …» se il caso è uno, «Individuati N casi noti: …» se sono di più.
- `execution.earlyResolution` e `execution.resolvedAtStep` spariscono.

### 3.6 La bozza per Watchtower

Il contratto `AnalysisDraftV1` di Watchtower resta com'è (D4): un'analisi per occorrenza, campi di testo di al massimo
5.000 caratteri, bozza serializzata entro 64 KiB (`ANALYSIS_DRAFT_BOUNDS.DRAFT_BYTES`), `additionalProperties: false`.

#### Quando l'analisi è completa

Un'analisi è **completa** quando:

- non ci sono errori non riconosciuti né falliti;
- l'enumerazione non è né troncata né satura;
- tutte le fonti di evidenza sono complete (§3.3);
- non ci sono errori non esaminati. In F1 si applica D10.

#### Le regole

- **Una rilevazione e analisi completa**: la bozza è identica a quella di oggi, se rientra nei limiti come oggi. Si
  verifica con le fixture attuali.
- **Negli altri casi con almeno una rilevazione** (`KNOWN_CASE`):
  - `conclusionNotes` è un elenco numerato in ordine di tempo, con una voce per caso:
    `1. 2026-11-19 10:15:42 UTC — <descrizione>: <risoluzione resa dal contesto della rilevazione>`;
  - in fondo, le righe di copertura: «Senza caso noto: K», «Analisi fallita: K», «Non esaminati: K» (o «almeno K»),
    «Evidenza incompleta: \<fonti\>», nell'unità della famiglia;
  - `errorDetails` unisce i dettagli dei casi in ordine di tempo.
- **`proposedStatus`** (D5): `COMPLETED` solo se l'analisi è completa e **tutte** le rilevazioni sono `COMPLETED`;
  altrimenti `IN_PROGRESS`. È la regola delle fasce 200/500 del §1.5, scritta in chiaro e valida per tutti i runbook.
- **`analysisType`** (D5): `IGNORABLE` solo se l'analisi è completa e **tutte** le rilevazioni sono `IGNORABLE` con lo
  stesso `ignoreReasonCode` e gli stessi `ignoreDetails`; altrimenti `ANALYZABLE`, senza campi di ignore.
- **Liste** (`resources`, `downstreams`, `finalActions`, `links`): unione come oggi, prima i default e poi i casi in
  ordine di tempo, senza duplicati.
- **Nessuna rilevazione** (`unknown-case` e `inconclusive`): `UNKNOWN_CASE_CONTEXT`, invariato e valido per lo schema
  v1. La differenza tra i due e la copertura viaggiano nell'output (§3.5), nel `RunbookCheck` e nel `resultSummary`
  del callback (§3.8), non nella bozza.

#### Misura a runtime

La bozza si compone e poi si misura com'è sul filo, cioè JSON in UTF-8, contro tutti i limiti: 5.000 caratteri per
campo e 64 KiB in totale.

1. Si riservano i campi obbligatori, le liste e le righe di copertura.
2. Si aggiungono voci intere, in ordine di tempo, finché ci stanno. L'ultima riga diventa «… e altri K casi (vedi
   l'esecuzione)».
3. **Ripiego**: se nemmeno la prima voce ci sta, si tiene la sua riga d'identificazione (numero, tempo, descrizione)
   e si accorcia la risoluzione con «…». La diagnosi e la copertura non spariscono mai.
4. Se lo spazio per le note non basta neppure così, si accorciano le liste facoltative (`links`, poi `finalActions`),
   mai `resources` e `downstreams`.

Le liste restano entro i 64 elementi come oggi. La misura si ripete sulla bozza finale, e la applicano anche
l'adattatore di completamento e la Lambda di go-watchtower prima dell'invio.

#### Validazione statica

`buildPotentialAnalysisDrafts` e `assertAnalysisAnnotations` verificano due cose:

- il caso peggiore delle liste, cioè tutti i casi annotati insieme, senza ordinamento per priorità (per le liste è già
  così oggi);
- che campi obbligatori, liste e righe di copertura stiano nei 64 KiB lasciando spazio almeno alla riga
  d'identificazione di una voce.

Il limite statico della singola risoluzione resta 5.000 caratteri; i testi composti si governano a runtime.

### 3.7 Il catalogo

1. **Togliere `priority`** dai 302 casi del catalogo, dai 4 dei toolkit e dalle factory interop
   (`createInteropApiGwKnownCaseFactory`, `interopK8sKnownCase`) e da `KnownCaseSpec`. È una modifica meccanica.
2. **Rivedere le sovrapposizioni.** Si eseguono i test di tutti i runbook e si elencano le fixture in cui corrisponde
   più di un caso. Per ciascuna si sceglie fra tre strade:
   - sono due errori diversi, ed è giusto vederli entrambi;
   - è lo stesso errore, e si usa `supersedes`, ma solo se l'ambito garantisce che i due casi parlino della stessa
     richiesta;
   - la condizione è sbagliata, e si corregge.

   Già noti:
   - il timeout di `pn-delivery-insert-trigger-eb-lambda` → `supersedes: ['lambda-timeout']` in F1: condizione
     identica sulla stessa variabile, quindi sullo stesso errore;
   - in `workday-pn-external-channel-alb-alarm`, `duplicated-event-400-02` → `supersedes: ['duplicated-event-err-cons']`
     **solo in F4**, quando l'ambito è la riga d'errore. In F1 si riportano entrambi i casi, che hanno la stessa
     risoluzione;
   - i casi «500 senza log correlati» → da verificare, perché alcuni sono già esclusivi grazie a `not(varExists(...))`.

   Restano come sono le 7 condizioni con `not(...)`, il condizionamento del BFF InfoPa e i casi dell'authorizer.

3. **Le fasce 200/500** e il loro commento si tolgono: la regola diventa quella del §3.6.
4. **`'resolve'`**: i 5 step del catalogo e i 5 dei toolkit restituiscono `continue`.
5. **Tempo nell'evidenza**: un controllo alla registrazione verifica che ogni query usata come evidenza dei casi
   proietti `@timestamp`, oppure `firstTimestamp` e `latestTimestamp` se aggregata. I test delle trasformazioni (BFF,
   tracker) verificano che il tempo arrivi fino all'elemento su cui la condizione lavora.
6. **Baseline**: `__baseline__/canonical.json` e `fingerprints.json` si rigenerano (la priorità entra nell'impronta di
   ogni runbook con casi), e cambia il `definitionDigest`. Non serve migrare nessun catalogo: il catalogo automatico
   non è mai stato rilasciato.

### 3.8 Chi legge i risultati

| Chi                                                                                                   | Che cosa cambia                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/go/go-analyze-alarm` (`analyzeOccurrence`, `renderFinalSummary`)                             | elenco cronologico con copertura; niente «priority N» né caso primario                                                                                                                                                                                                                                                                                                                    |
| `packages/go-watchtower-runbook` (`matchAnalysis`, `matchAnalysisAi`)                                 | i segnali si valutano **per rilevazione**. `MATCH_EXACT` richiede che caso e identificatore completo (tipo e sorgente, quando ci sono) concordino sulla **stessa** rilevazione. Se concorda solo l'identificatore, l'esito resta un conflitto. Il matcher AI non può promuovere una divergenza semantica a `MATCH_EXACT`                                                                  |
| `packages/go-watchtower-runbook` (`classifyRunbookOutcome`, `checkOccurrence`)                        | nuova classificazione per `inconclusive`, distinta da `MISS`, `NO-DATA` e `CONFIG-ERROR`; la copertura entra nel `RunbookCheck`                                                                                                                                                                                                                                                           |
| `packages/go-watchtower-runbook` (`cache/runbookFingerprint.ts`)                                      | `EXPECTED_OUTPUT_SCHEMA_VERSION` (oggi `'1.0.0'`, ripetuto a mano) legge la costante esportata da go-runbook. Entra già nell'impronta, quindi le voci in cache della v1 vengono scartate                                                                                                                                                                                                  |
| `packages/go-watchtower-runbook` (`check/buildReport.ts`)                                             | lo `schemaVersion` del report RTA passa da `1.1.0` a `2.0.0`, con tipi e fixture aggiornati                                                                                                                                                                                                                                                                                               |
| `scripts/go/go-rta-check` (`renderConsole`, `writeReport`)                                            | colonne e report con l'elenco delle rilevazioni e la copertura al posto di `primaryCaseId`                                                                                                                                                                                                                                                                                                |
| `scripts/go/go-execute-runbook` (`executeRunbook`, `toCompleteAnalysisDraft`, `buildTrackingEntries`) | si adegua alla bozza (misura a runtime del §3.6) e all'outcome nuovi; `inconclusive` si traduce in `UNKNOWN_CASE` con la copertura nel `resultSummary`; le voci di tracking diventano per errore, con i campi di correlazione. Oppure si elimina prima con la catena descritta in [DRAFT-001](../../drafts/DRAFT-001-ExecuteRunbookRemoval/DRAFT-001-ExecuteRunbookRemoval-CLAUDE-v01.md) |
| Reporter dei toolkit (`ApiGwServiceChainReporter`, `LambdaReporter`, `renderApiGwFinalSummary`)       | niente «← primario»; elenco con i tempi e, per errore, la sua traversata                                                                                                                                                                                                                                                                                                                  |
| Lambda dei runbook in go-watchtower (repository a parte)                                              | legge `RunbookOutput` 2.0.0 e la bozza, applica la stessa misura a runtime prima dell'invio, e traduce `inconclusive` come il worker. Prima del rilascio si verifica come Watchtower applica un `UNKNOWN_CASE` con `resultSummary` di analisi parziale. Il contratto della bozza non cambia (D4)                                                                                          |

### 3.9 Documentazione e rilascio

- `docs/RUNBOOKENGINE.md` (28 passaggi su priorità e risoluzione anticipata, compreso l'esempio didattico),
  `docs/ARCHITECTURE.md` (3) e il README di `go-runbook`.
- Un changeset per `@pagopa/go-runbook` che descrive la modifica incompatibile. Il repository è in pre mode `next`,
  quindi esce come `1.0.0-next.N`.
- Gli artefatti storici di `artifacts/runbook-automation/remediation/2026-10-17/` non si toccano.

### 3.10 Le fasi

Ogni fase si chiude con `pnpm check` verde.

1. **F1: i casi e la copertura.** Motore (§3.2), copertura degli step (§3.3), output (§3.5), bozza (§3.6), catalogo
   (§3.7), consumatori (§3.8), tempo negli aggregati e negli oggetti derivati interop, documentazione.
   - Basta da sola per interop k8s e interop API GW.
   - Per le famiglie del §1.3 riporta tutti i casi presenti nell'evidenza raccolta, ma su un solo errore, e dichiara
     gli altri come non esaminati.
   - In API GW la richiesta rappresentativa diventa la più vecchia. È la **riga attiva**, la stessa per parser,
     authorizer, execution log e hook: è la vista per errore del §3.4 con un solo errore.
2. **F2: analisi per errore, SEND API Gateway**, con la misura dei costi su occorrenze reali.
3. **F3: analisi per errore, Lambda**, comprese le varianti multi-account.
4. **F4: analisi per errore, SEND service e downstream**, più la copertura di SPID Hub e Logsaver.

## 4. Test e verifica

- **Motore**:
  - valutazione nell'ordine di dichiarazione;
  - ordine cronologico, parità di tempo e rilevazioni senza tempo;
  - `supersedes`: rimozione per ambito, traccia ed errori di validazione;
  - esecuzione di tutte le azioni nell'ordine, ciascuna resa dal suo contesto;
  - nessuna traccia di `'resolve'` nei tipi né nel motore;
  - raccolta della copertura dagli step e dalle iterazioni.
- **Valutatore**:
  - minimo e massimo su più di 10 righe che corrispondono, con righe ordinate `desc`;
  - `pattern` su tutte le righe;
  - evidenza solo dai rami soddisfatti: un `or` con un ramo d'ambiente falso non porta evidenza;
  - una riga che soddisfa due rami conta una volta;
  - `not` non porta evidenza;
  - righe aggregate con `count`, gruppi ripetuti e intervalli che si sovrappongono;
  - gruppi `{ …, rows }` e oggetti derivati;
  - righe senza tempo;
  - formato del tempo Logs Insights (`2026-11-19 10:15:42.123`) normalizzato in UTC.
- **Copertura**:
  - query satura;
  - aggregato saturo;
  - CID saltati;
  - sorgente Lambda satura o illeggibile con l'altra sorgente regolare, senza perdere le righe;
  - execution log `unavailable` in `best-effort`;
  - ciascuno di questi casi rende l'analisi non completa.
- **Bozza**:
  - una rilevazione con analisi completa, uguale alle fixture di oggi;
  - una rilevazione `COMPLETED` più un errore non riconosciuto, fallito, non esaminato (con D10 applicata) o
    un'evidenza incompleta → `IN_PROGRESS` e riga di copertura;
  - più casi: note, regole di stato e di tipo, motivi di ignore diversi;
  - `inconclusive` → `UNKNOWN_CASE_CONTEXT` valido per lo schema, con la copertura nel `resultSummary`;
  - misura a runtime con testo multibyte e caratteri da escapare;
  - una prima voce con una risoluzione di 5.000 caratteri più le righe di copertura: identificazione e copertura
    restano, la risoluzione si accorcia;
  - le fixture di `contracts/runbook-automation/v1/owned/fixtures/` validano ancora contro lo schema di Watchtower.
- **Analisi per errore**:
  - isolamento di variabili e output tra iterazioni;
  - viste per errore: `steps.<id>` nell'iterazione restituisce solo le righe dell'errore;
  - `goTo` e `stop` dentro il blocco;
  - iterazione fallita seguita da iterazioni riuscite;
  - abort globale;
  - letture di finestra memorizzate: una sola query, condizione valutata per errore;
  - mutazione annidata nel blocco rifiutata da `assertCloudExecutableRunbook`;
  - servizi e account del blocco preparati dal preflight;
  - blocco incluso nel digest;
  - limite, saturazione e troncamento dichiarati;
  - identificatori non validi → evidenza non attribuita, mai interpolati;
  - traccia per iterazione.
- **Scenari di famiglia**:
  - **API GW, F1**: la richiesta più vecchia senza `errorMessage` e una più recente con: metadati e conteggio restano
    quelli della scansione e della riga attiva.
  - **API GW, F2**:
    - un timeout dell'authorizer sulla richiesta A e un errore di servizio sulla richiesta B: ciascuno si attribuisce
      alla sua richiesta, con i suoi metadati, anche negli hook di Stream;
    - sonda B2B dopo la traversata, con la query eseguita una volta;
    - lotto dell'execution log saturo da una richiesta verbosa.
  - **Lambda**:
    - due timeout con `lambdaRequestId` diversi rendono due messaggi diversi e corretti;
    - righe senza `@requestId` ma con il requestId nel messaggio;
    - righe senza requestId valido → errore «non attribuito»;
    - le due varianti multi-account;
    - tre righe della stessa invocazione contano un'invocazione.
  - **SelfcarePG**:
    - errore vuoto e timeout sullo stesso trace;
    - errore vuoto e timeout su trace diversi;
    - sullo stesso trace, un secondo errore più recente;
    - tutti anche in ordine inverso.
  - **Workday**: il trace A con il solo `ERR_CONS_DUPLICATED_EVENT` e il trace B con tutti e tre i marcatori. In F1
    escono entrambi i casi e non sparisce niente. In F4 ogni riga ha il suo caso.
  - **Interop**: un gruppo raro escluso da un aggregato saturo è dichiarato; il tempo del BFF arriva alla rilevazione.
  - **SPID Hub e Logsaver**: la copertura riporta i conteggi e la correlazione manuale.
- **Catalogo**:
  - test di tutti i runbook aggiornati;
  - elenco delle sovrapposizioni rivisto voce per voce e allegato al registro della specifica;
  - controllo del tempo sulle query di evidenza e sulle trasformazioni;
  - baseline rigenerate.
- **Lettori**:
  - le voci di cache della v1 vengono scartate;
  - i report RTA vecchi e nuovi si distinguono per versione;
  - lo scenario A/B del matcher: un timeout umano sul trace A, il runbook trova un 403 su A e un timeout su B → non è
    `MATCH_EXACT`, in entrambi i matcher;
  - `inconclusive` classificato e tradotto nel callback.
- **Verifica reale, in sola lettura**: `go-rta-check` su occorrenze recenti dei runbook API GW, Lambda, service,
  downstream e interop, prima e dopo. Si confrontano casi trovati, ordine, copertura, query, durata e accordo con le
  analisi umane in Watchtower.
- **Gate**: `pnpm check` e `pnpm lint`, compresi `check:published` e `check:published:sources` per il package
  pubblicato.

## 5. Fuori da questa specifica

- **Un contratto Watchtower v2** con un elenco strutturato di casi (`cases[]`) e campi di copertura al posto delle note
  composte. Vale se si vuole che Watchtower mostri e filtri i singoli casi. Richiede lavoro nel repository
  go-watchtower (D4).
- **La paginazione o il partizionamento nel tempo** delle query. In questa specifica la saturazione si dichiara
  (§3.3).
- **Il raggruppamento delle query per trace id** nell'analisi per errore, finché le misure non lo chiedono (§3.4).
- **Il raggruppamento degli errori per firma** (stesso status, path e messaggio), analizzando un solo errore per
  gruppo. Riduce le query, ma ripropone un errore "rappresentativo": due richieste con la stessa firma possono avere
  cause diverse a valle. È l'alternativa a D8.
- **Le righe di errore che nessun caso spiega** nelle famiglie senza enumeratore (interop). Contarle richiede di
  distinguere le righe d'errore da quelle di contesto, query per query. Si riprende dopo aver visto i risultati reali
  di F1 (D9, rimandata). Le fonti incomplete (saturazione, CID saltati) invece entrano già nella copertura (§3.3).
- **La correlazione per richiesta delle congiunzioni** nelle famiglie senza enumeratore (§3.2, limite noto).
- **Le azioni `notify`, `escalate`, `update` e `composite`**: nessun caso del catalogo le usa. Toglierle è una pulizia
  a parte.
- **La priorità degli allarmi** in Watchtower e in `go-watchtower-client`: è un'altra cosa e non si tocca.

## 6. Le scelte del committente

- **D1 · Fin dove arrivare.**
  - (a) Solo i casi (F1): tutti i casi noti sull'evidenza raccolta, ma le famiglie SEND continuano ad analizzare un
    errore solo e dichiarano gli altri come non esaminati.
  - (b) Casi più analisi per errore (F1–F4): tutti gli errori della finestra.

  **Proposta: (b)**, a fasi, con F1 rilasciabile da sola. Solo con (b) "tutti gli errori" vale anche per i 36
  runbook delle famiglie del §1.3. Il 19 novembre 2026 il committente ha scelto di tenere F1–F4 in questa specifica;
  resta da confermare l'approvazione della specifica.

- **D2 · La risoluzione anticipata.** Toglierla del tutto, oppure tenerla come ottimizzazione. **Proposta: toglierla.**
  Se la pipeline si ferma al primo caso trovato, non si possono avere tutti gli errori. Dove la pipeline non ha
  davvero altro da fare c'è già `stop`.
- **D3 · Sovrapposizioni tra casi.**
  - (a) `supersedes` sul caso, nell'ambito dell'errore o dell'esecuzione;
  - (b) solo `not(...)` nelle condizioni, come già fanno 7 casi;
  - (c) un flag `catchAll` (il caso si riporta solo se non ne corrisponde nessun altro).

  **Proposta: (a).** Copre sia il caso generico sia la sostituzione di un caso condiviso, il builder la valida e non
  allunga le condizioni. Si usa solo dove l'ambito garantisce che i due casi parlino della stessa richiesta. (b) resta
  disponibile. (c) non copre la sostituzione.

- **D4 · Il contratto della bozza.** Tenere `AnalysisDraftV1` e comporre le note in ordine di tempo, oppure aprire una
  v2 con `cases[]` in go-watchtower. **Proposta: tenere la v1.** Nessun lavoro sul contratto nell'altro repository, e
  con un caso solo e analisi completa la bozza non cambia.
- **D5 · Stato e tipo con più casi.** Regole del §3.6: `COMPLETED` e `IGNORABLE` solo con analisi completa e tutti i
  casi concordi. **Proposta: queste regole.** Sostituiscono le fasce 200/500 senza perdere la garanzia che un caso
  benigno non nasconda lavoro da fare.
- **D6 · Le azioni.** Eseguire le azioni di tutte le rilevazioni in ordine di tempo, oppure solo della prima in ordine
  di tempo. **Proposta: tutte**, ciascuna sul suo contesto. Nel catalogo sono solo `log`, e l'operatore deve vedere
  ogni caso.
- **D7 · Rilevazioni senza tempo.** In fondo all'elenco, nell'ordine di dichiarazione. **Proposta: sì.** Con (b) di D1
  restano solo i casi su variabili fuori dall'analisi per errore, come il caso Spot di Logsaver.
- **D8 · Il limite dell'analisi per errore** (solo con D1 (b)). **Proposta: 20 errori per esecuzione**, i più vecchi
  per primi, configurabile per runbook, con troncamento dichiarato e `IN_PROGRESS`. L'alternativa è il raggruppamento
  per firma del §5.
- **D9 · Righe di errore non spiegate** nelle famiglie senza enumeratore. **Rimandata** (§5): si riprende dopo F1, sui
  risultati reali.
- **D10 · Gli errori non esaminati in F1.** In F1 le famiglie del §1.3 analizzano ancora un errore solo e dichiarano
  gli altri come non esaminati, nell'unità della famiglia. Saturazione, fallimenti ed evidenza incompleta rendono
  sempre l'analisi non completa: D10 riguarda solo gli errori non esaminati per fase. Le opzioni sono due:
  - (a) contarli nelle note e nell'output, ma senza effetto su stato e tipo: è il comportamento di oggi, reso visibile;
  - (b) contarli come per l'analisi non completa: `IN_PROGRESS` e `ANALYZABLE`.

  **Proposta: (a)** se F2–F4 seguono a breve, perché (b) toglierebbe la chiusura automatica a molte occorrenze che
  oggi la hanno. **(b)** se F1 resta a lungo da sola. Va scelta prima di rilasciare F1, e i test della bozza la
  esercitano esplicitamente.
