# SPEC-002 · Runbook Automation: tutti gli errori, in ordine di tempo — v07

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: la richiesta del committente del 19 novembre 2026
- Revisione: la v07 recepisce il sesto giro di revisione di Codex. Il committente ha scelto di tenere in questa
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
    rappresentativo. `ParseLambdaErrorsStep` ricava messaggio, categoria, requestId e instradamento downstream
    dall'intera scansione. `lambdaErrorCount` conta righe, non invocazioni.
  - `lambdaLogEvidenceMatches` vede tutte le righe d'errore della finestra. In downstream-monitoring un S3 SlowDown
    sull'invocazione B può escludere, con una negazione a livello di finestra, lo SlowDown generico dell'invocazione A.
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
- il BFF (`AnalyzeBffEvidenceStep`) e il tracker trasformano le righe in oggetti derivati che perdono il tempo. Il
  BFF raggruppa le richieste in `{ cid, logs }`, con tutti i log della richiesta, e alcuni casi (JWT scaduto, timeout
  Selfcare) usano `exists` su quei gruppi. Il tracker produce `{ cid, rows }`.

Anche fuori da interop alcuni step dicono «tutto bene» quando non hanno visto niente:

- `QueryServiceLogsStep` salta AWS e restituisce zero righe quando non ha un trace id né un fallback utilizzabile.
  Così un caso come `apigw-endpoint-timeout-no-delivery-logs`, che propone `COMPLETED` su `deliveryLogCount == '0'`,
  si chiude senza aver guardato `pn-delivery`;
- gli hook di Stream e la sonda di versioning B2B restituiscono successo con output vuoto quando la lettura fallisce;
- con la paginazione disattivata, il lettore CloudWatch restituisce la prima pagina e scarta `nextToken`. Una pagina
  sotto il limite della query può quindi sembrare completa.

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

- **Watchtower** riceve ancora **un'analisi per occorrenza**. Se il runbook trova un caso solo e la copertura non ha
  niente da segnalare, la bozza resta identica a oggi. Negli altri casi `conclusionNotes` elenca i casi in ordine di
  tempo e la copertura, e stato e tipo seguono regole esplicite (§3.6) invece della priorità.
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
  quattro forme:

  | Forma dell'elemento                   | Tempo                                             | Peso                    |
  | ------------------------------------- | ------------------------------------------------- | ----------------------- |
  | Riga semplice                         | `@timestamp` (o `timestamp`), normalizzato in UTC | 1                       |
  | Riga aggregata                        | `firstTimestamp` e `latestTimestamp`              | `count`                 |
  | Oggetto con `supportingRows`          | minimo e massimo delle righe che lo sostengono    | righe che lo sostengono |
  | Gruppo (`{ …, rows }`) senza le prime | minimo e massimo delle sue righe (approssimato)   | 1                       |

  Gli step che derivano un oggetto da una sequenza di righe dichiarano in `supportingRows` **le righe che lo
  sostengono**, non tutti i log del gruppo. È il caso del BFF interop: per «JWT scaduto» le righe della sequenza che
  lo prova, non tutti i log della richiesta. Così i casi con `exists` su quei gruppi hanno un tempo giusto. Per i
  gruppi del tracker dei CID, su cui i casi applicano regex, l'intervallo è quello del gruppo e pesa 1: è
  un'approssimazione dichiarata (§5). Le query aggregate di interop (access log e warning di servizio) aggiungono
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

- **Visite ripetute.** Dentro un'esecuzione, o un'iterazione, uno step può girare più volte. Per esempio
  `DecideNextStep` ripete lo stesso servizio dopo aver promosso un fallback UUID a trace id. Il contesto conserva
  allora gli output di **tutte** le visite. Per l'evidenza (predicati su array) `steps.<id>` restituisce le righe di
  tutte le visite, in ordine. Le variabili scalari restano quelle dell'ultima scrittura, come oggi: servono alla
  traversata. Così una riga trovata con il fallback e non con il trace non sparisce prima della valutazione dei casi.
  Lo stesso vale per l'assenza (§3.3): si valuta su tutte le visite che portano evidenza per l'errore attivo, non
  sull'ultima.
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
  /**
   * Etichetta sicura della sorgente (account logico, log group, lotto); assente se lo step ne ha una sola.
   * Mai un nome di profilo AWS locale: quello resta interno all'instradamento della query.
   */
  readonly source?: string;
  /** false se l'evidenza di questa sorgente è parziale. */
  readonly complete: boolean;
  /**
   * 'saturated': righe = limite, oppure la risposta ha altre pagine;
   * 'unavailable': sorgente non leggibile;
   * 'skipped': lettura non fatta o elementi scartati;
   * 'manual': correlazione non automatica.
   */
  readonly reason?: 'saturated' | 'unavailable' | 'skipped' | 'manual';
  /** Al più 200 caratteri, ripulito dai nomi dei profili AWS locali; non entra nella bozza. */
  readonly detail?: string;
}
```

`StepResult.coverage` è un elenco facoltativo, con una voce per sorgente. Se manca vale «completo». Il motore
raccoglie le voci di tutta l'esecuzione (e di ogni iterazione, §3.4) nella **copertura** del risultato. In più ci sono
i conteggi degli errori, nelle unità del §3.5.

**La saturazione si misura alla frontiera della query**, una volta per tutte, nel livello comune delle query
CloudWatch Logs Insights dei toolkit. Il risultato è satura se le righe sono tante quante il limite della query,
oppure se la risposta indica altre pagine (`nextToken`) che non si leggono. La misura si fa sul risultato grezzo,
prima di filtri, normalizzazioni, aggregazioni o fusioni. Viaggia con il risultato anche quando è riusato da una
lettura memorizzata (§3.4). Il controllo di Logsaver tra le righe d'errore grezze e `recordsMatched` resta, e diventa
una voce `saturated`.

Chi dichiara altro:

| Step                                                                                  | Quando                                                                                                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Tracker dei CID interop                                                               | `SkippedCidCount > 0` (`skipped`)                                                                                              |
| `QueryLambdaAcrossAccountsStep`                                                       | una voce per sorgente: satura o illeggibile                                                                                    |
| `QueryApiGwExecutionLogsStep`                                                         | lotto saturo, o evidenza `unavailable` in modalità `best-effort`                                                               |
| `QueryStreamLambdaLogsStep`, sonda di versioning B2B                                  | lettura tentata e fallita (`unavailable`)                                                                                      |
| `QueryServiceLogsStep`, `QueryServiceTraceLogsStep` e ogni lettura per identificatore | lettura saltata per mancanza di un identificatore utilizzabile, mancante o rifiutato (`skipped`)                               |
| `QueryInteropPodContextStep` (sei runbook interop)                                    | righe = limite, o `recordsMatched` oltre le righe restituite dove il runbook lo controlla (`saturated`); oggi lancia un errore |
| SPID Hub, Logsaver                                                                    | il limite di righe che oggi fa lanciare un errore a SPID Hub diventa `saturated` (F4)                                          |
| SPID Hub                                                                              | correlazione con l'ALB manuale (`manual`)                                                                                      |

Due regole valgono per tutti:

- **Una lettura saltata non è una lettura vuota.** Uno step che non interroga AWS non scrive un conteggio zero: scrive
  la voce `skipped`, e le condizioni di assenza (`deliveryLogCount == '0'`) non sono soddisfatte. Così un caso che
  chiude su un'assenza richiede una lettura riuscita e vuota.
  - La regola vale per tutta la catena. Lo step di lettura passa l'esito (`queried`, `saturated`, `skipped`,
    `unavailable`) a chi analizza le righe. `AnalyzeTraversedServiceLogsStep` e gli altri analizzatori pubblicano
    `<prefisso>LogCount` solo dopo una lettura eseguita (completa o satura, vedi sotto). Dopo una lettura saltata il
    conteggio non esiste, e la rilevazione benigna non compare nemmeno.
  - La regola vale anche sulle visite ripetute: una seconda visita saltata non cancella il conteggio di una prima
    visita riuscita, e non lo inventa.
  - **Lo stato della lettura e il conteggio sono due cose.** L'analizzatore pubblica sempre `<prefisso>LookupState`
    (`queried`, `saturated`, `skipped`, `unavailable`). Pubblica `<prefisso>LogCount` dopo ogni lettura eseguita,
    anche satura, perché il conteggio delle righe viste è vero.
    - Le condizioni positive che vogliono solo sapere se un servizio è stato interrogato leggono lo stato: la guardia
      del BFF InfoPa (`externalRegistriesLogCount`) e il timeout data-vault di B2B (`dataVaultLogCount`).
    - Le condizioni d'assenza (`LogCount == '0'`) richiedono `LookupState == 'queried'`: una lettura completa e
      vuota. Con visite ripetute, l'analizzatore pubblica anche `<prefisso>LogCountAllVisits`, il totale delle righe
      di tutte le visite per l'errore attivo. Le condizioni d'assenza usano quel totale. Un fallback con righe seguito
      da una lettura per trace vuota non è un'assenza.
    - Il catalogo si adegua in questo senso.

    Una lettura satura resta comunque nella copertura, quindi una rilevazione positiva conservata non porta a
    `COMPLETED`.
- **Una lettura si fa se c'è l'identificatore, non se c'è il messaggio.** `QueryApiGwExecutionLogsStep` oggi scarta
  le richieste in errore senza `errorMessage` nell'access log prima di guardare i requestId. Nei runbook con diagnosi
  sull'execution log (per esempio `integration-signature-mismatch` di IO_EXP), il criterio diventa un requestId
  valido su un errore ammesso. Se una lettura non si fa di proposito, lo dice con una voce `skipped`.
- **Nessuna sorgente dipende dall'ordine delle altre.** `QueryLambdaAcrossAccountsStep` tenta ogni sorgente
  leggibile, in qualunque ordine e qualunque sia l'esito delle precedenti. Tiene tutte le righe restituite, anche
  quelle di una sorgente satura, e scrive una voce per sorgente: niente più eccezione sulla saturazione. La scelta
  delle sorgenti e i controlli di account e autorizzazione restano nel preflight. Un errore lì, che è di
  configurazione, fa ancora fallire l'esecuzione. Diventa `unavailable` solo l'errore di lettura di una sorgente.

Le query aggregate interop ordinano per `latestTimestamp desc` invece che per `count desc`. Così una saturazione
taglia i gruppi più vecchi e non quelli rari ma recenti. La saturazione resta comunque dichiarata.

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
  il messaggio. I casi si valutano comunque sul contesto parziale dell'iterazione, e le rilevazioni positive restano.
  Per esempio, un timeout dell'authorizer già provato non sparisce perché una lettura successiva fallisce. Le
  rilevazioni delle altre iterazioni restano valide. L'esecuzione resta `completed`, ma l'evidenza non è completa
  (§3.6). Così una rilevazione su un contesto parziale, anche una che si basa su un'assenza o una negazione, non porta
  mai a una chiusura automatica.
- Lo stesso vale **senza analisi per errore**, e quindi anche per l'errore attivo di F1. Se uno step fallisce dopo
  che una parte dell'evidenza è stata raccolta, i casi si valutano sul contesto raggiunto, e le rilevazioni positive
  restano. Questo vale con o senza `continueOnFailure`, e anche per uno step `silent` come `QueryServiceLogsStep`.
  - La lettura fallita diventa una voce `unavailable`, e l'evidenza non è completa. Il risultato non entra in cache.
  - L'esecuzione è `failed` solo se fallisce prima di aver raccolto qualunque evidenza, per esempio la query
    dell'access log o un errore di configurazione.
  - È ciò che oggi garantiva la risoluzione anticipata: un timeout dell'authorizer seguito da una lettura di servizio
    fallita non perde più la diagnosi.
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

  Anche i validatori della costruzione conoscono il blocco:
  - i controlli che legano i casi agli step (`wiredStepIds()` di `finishAlarmRunbook`, `findUnwiredKnownCaseStepRef`)
    riconoscono gli id degli step del blocco;
  - `RunbookBuilder` rifiuta id duplicati o che ne nascondono un altro fra gli ambiti visibili;
  - `RunbookBuilder` valida i `goTo` con lo stesso indice limitato al blocco che usa il motore: un salto da un blocco a
    un altro è rifiutato alla costruzione.

#### Copertura dell'enumerazione

Le query di enumerazione ordinano per `@timestamp asc`. Così, se c'è un limite, si perdono gli errori più recenti e
non i più vecchi. Se la query satura, l'enumerazione dichiara `coverage.complete: false` e l'output dice «almeno N».
Niente paginazione in questa specifica: la saturazione si dichiara, non si nasconde.

#### Identificatori

Un modulo comune valida gli identificatori (requestId, trace id) con una allowlist, come fa già la variante
multi-account, e li rende nei predicati CloudWatch con l'escaping di `@pagopa/go-aws`. Lo usano l'enumerazione, la
query delle invocazioni, la query downstream e i metadati di traccia. Una riga con un identificatore non valido è
evidenza «non attribuita». Una lettura che non ha un identificatore utilizzabile si salta e si dichiara `skipped`
(§3.3).

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
  - Ogni invocazione ha la sua categoria (`timeout`, `out-of-memory`, …).
  - Ogni riga senza requestId valido è un errore «non attribuito» **a sé**, valutato da solo. Così una negazione
    come `not(S3_SLOW_DOWN)` non mescola righe di invocazioni diverse.
  - La copertura conta a parte le righe non attribuite e le invocazioni distinte. Con una scansione satura, il minimo
    delle invocazioni (`observed` con `lowerBound: true`) si calcola dalle coppie distinte di sorgente e requestId
    viste.
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
  - **Limite dichiarato**: l'evidenza del trace è condivisa dalle righe d'errore dello stesso trace. Se nello stesso
    trace ci sono un errore SelfcarePG vuoto e un timeout di un'altra chiamata, il timeout si associa all'errore
    SelfcarePG. Attribuire l'evidenza alla singola chiamata (span, sequenza, endpoint) resta fuori (§5).
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
- **Evidenza dichiarata** (`buildDeclaredOutputContext`, `buildStepEvidence`): si costruisce anche per iterazione,
  con i descrittori e i risultati dell'iterazione e la chiave dell'errore. La politica dei campioni resta quella di
  oggi. Così il campione dell'execution log di IO_EXP resta nell'output e appartiene alla richiesta che ha prodotto la
  rilevazione.
- **Copertura** (sempre presente, anche in F1):
  - `unit`: l'unità di conteggio della famiglia. Vale `request` per API GW (requestId distinti), `invocation` per
    Lambda (invocazioni distinte), `errorRow` per service e downstream, `window` per le famiglie senza enumeratore;
  - `observed`: gli elementi visti, con `lowerBound: true` quando l'enumerazione è incompleta per **qualunque**
    motivo (saturazione, sorgente non disponibile, pagine non lette); poi `selected`, `analyzed`, `unrecognized`,
    `failed`;
  - `unexamined = observed − selected`, mai negativo: zero se non c'è niente da esaminare;
  - in Lambda due popolazioni con contatori separati: invocazioni distinte e righe non attribuite (§3.4). Ciascuna
    ha i suoi contatori, e la regola di chiusura si applica a entrambe;
  - `sources[]`: le dichiarazioni `StepCoverage` incomplete, con step e motivo.

  In F1, nelle famiglie del §1.3, `observed` si conta già nell'unità giusta: invocazioni distinte, non righe. È un
  valore immutabile della scansione, che nessuno step successivo riscrive. `selected` vale 1 se c'è almeno un errore,
  0 altrimenti.

- Con l'analisi per errore: `errors.items[]` con `occurredAt`, `key`, campi di correlazione, stato (`recognized`,
  `unrecognized`, `failed`), copertura dell'iterazione e rilevazioni dell'errore.
- Con zero rilevazioni l'esito dipende dall'evidenza (§3.6), non dal riconoscimento:
  - **`'unknown-case'`**: l'evidenza è completa e nessun caso corrisponde, compreso il caso di errori esaminati per
    intero ma non riconosciuti;
  - **`'inconclusive'`**, nuovo: l'evidenza non è completa, per fallimenti, letture saltate o fonti sature.

  `'inconclusive'` si distingue così anche da un'esecuzione mai partita.

- Messaggio: «Individuato caso noto: …» se il caso è uno, «Individuati N casi noti: …» se sono di più.
- `execution.earlyResolution` e `execution.resolvedAtStep` spariscono.

### 3.6 La bozza per Watchtower

Il contratto `AnalysisDraftV1` di Watchtower resta com'è (D4): un'analisi per occorrenza, campi di testo di al massimo
5.000 caratteri, bozza serializzata entro 64 KiB (`ANALYSIS_DRAFT_BOUNDS.DRAFT_BYTES`), `additionalProperties: false`.

#### Due domande distinte

- **L'evidenza è completa?** Sì quando:
  - nessuna iterazione è fallita;
  - l'enumerazione non è né troncata né satura;
  - tutte le voci di copertura delle fonti sono complete (§3.3).

  Decide fra `unknown-case` e `inconclusive` (§3.5). Gli errori non esaminati per fase (F1) non contano qui:
  contano nella domanda successiva.

- **La chiusura automatica è ammessa?** Sì quando:
  - l'evidenza è completa;
  - non ci sono errori non riconosciuti;
  - **tutte** le rilevazioni concordano (vedi sotto).

  - non ci sono errori non esaminati (D10): in F1 una sola richiesta, invocazione o riga analizzata con altre
    osservate impedisce la chiusura automatica.

#### Le regole

- **Una rilevazione e nessuna riga di copertura** (niente non riconosciuti, falliti, non esaminati, fonti
  incomplete): la bozza è identica a quella di oggi, se rientra nei limiti come oggi. Si verifica con le fixture
  attuali.
- **Negli altri casi con almeno una rilevazione** (`KNOWN_CASE`):
  - `conclusionNotes` è un elenco numerato in ordine di tempo, con una voce per caso:
    `1. 2026-11-19 10:15:42 UTC — <descrizione>: <risoluzione resa dal contesto della rilevazione>`;
  - in fondo, le righe di copertura, **sempre presenti quando non sono zero**. Sono conteggi
    compatti per motivo, nell'unità della famiglia: «Senza caso noto: K», «Analisi fallita: K», «Non esaminati: K»
    (o «almeno K»), «Evidenza incompleta: K fonti (sature S, non disponibili U, saltate L)». Il dettaglio per fonte
    sta solo nell'output strutturato (§3.5);
  - `errorDetails` unisce i dettagli dei casi in ordine di tempo.
- **`proposedStatus`** (D5): `COMPLETED` solo se la chiusura automatica è ammessa e **tutte** le rilevazioni sono
  `COMPLETED`; altrimenti `IN_PROGRESS`. È la regola delle fasce 200/500 del §1.5, scritta in chiaro e valida per
  tutti i runbook.
- **`analysisType`** (D5): `IGNORABLE` solo se la chiusura automatica è ammessa e **tutte** le rilevazioni sono
  `IGNORABLE` con lo stesso `ignoreReasonCode` e gli stessi `ignoreDetails`; altrimenti `ANALYZABLE`, senza campi di
  ignore.
- **Liste** (`resources`, `downstreams`, `finalActions`, `links`): unione come oggi, prima i default e poi i casi in
  ordine di tempo, senza duplicati.
- **Nessuna rilevazione** (`unknown-case` e `inconclusive`): `UNKNOWN_CASE_CONTEXT`, invariato e valido per lo schema
  v1. La differenza tra i due e la copertura viaggiano nell'output (§3.5), nel `RunbookCheck` e nel `resultSummary`
  del callback (§3.8), non nella bozza.

#### Misura a runtime

La bozza si compone e poi si misura com'è sul filo, cioè JSON in UTF-8, contro tutti i limiti: 5.000 caratteri per
campo e 64 KiB in totale.

1. Si riservano i campi obbligatori, le liste e le righe di copertura. Queste hanno forma compatta e lunghezza
   limitata (§3.6, «Le regole»), mai il testo di un errore del provider.
2. **`conclusionNotes`**: si aggiungono voci intere, in ordine di tempo, finché ci stanno sia nei 5.000 caratteri
   sia nei byte che restano dei 64 KiB, misurati come JSON in UTF-8.
   L'ultima riga diventa «… e altri K casi (vedi l'esecuzione)».
3. **`errorDetails`** ha un budget proprio di 5.000 caratteri, con la stessa regola e lo stesso controllo sui byte:
   dettagli interi in ordine di tempo, poi «… e altri K». Due casi con 3.000 caratteri di dettagli ciascuno danno il
   primo intero e il secondo accorciato o rimandato.
4. **Ripiego**: se nemmeno la prima voce di un campo ci sta, si tiene la sua riga d'identificazione (numero, tempo,
   descrizione) e si accorcia il testo con «…». La diagnosi e la copertura non spariscono mai.
5. Se il totale supera ancora i 64 KiB, si accorciano le liste facoltative (`links`, poi `finalActions`), mai
   `resources` e `downstreams`.
6. Se non basta ancora, per esempio con liste facoltative già vuote, si accorciano i due testi in modo
   deterministico, prima `errorDetails` e poi le risoluzioni di `conclusionNotes`. Restano sempre le righe di copertura
   e la riga d'identificazione della prima voce, che il controllo statico garantisce.

Le liste restano entro i 64 elementi come oggi. La misura si ripete sulla bozza finale. La funzione che la fa è una
sola, esportata da go-runbook, e la usano anche l'adattatore di completamento e la Lambda di go-watchtower prima
dell'invio.

#### Il corpo intero del callback

Oltre alla bozza, il callback di completamento porta l'output (`analysisPayload`) e il `resultSummary`, e Watchtower
rifiuta un corpo oltre 1 MiB. Un rifiuto per dimensione (413) oggi fa segnare l'esecuzione come fallita. Per questo:

- ogni `resolvedMessage` e ogni riga resa di un'azione `log` si limita a 4.000 caratteri, con «…»: un errore
  applicativo interpolato non li gonfia più. Lo stesso limite vale per i testi grezzi del contesto che l'output
  copia, come `lastErrorMsg` di Lambda, in `context.details` e in `context.fields`;
- la stessa funzione esportata da go-runbook misura la **richiesta intera** come JSON in UTF-8, nei due punti di
  callback. Se supera il limite, riduce in modo deterministico la diagnostica facoltativa: prima i campioni di log e
  la telemetria, poi i messaggi resi delle rilevazioni oltre la prima, poi le voci per errore oltre il limite di D8;
- se dopo queste riduzioni il corpo supera ancora il limite, si passa alla **forma compatta finale**:
  - `analysisPayload` contiene solo esito, rilevazioni (id del caso, tempi, chiave dell'errore), copertura compatta
    e l'indicazione della riduzione;
  - `resultSummary` ha solo campi limitati;
  - il contesto grezzo e la diagnostica per errore si tolgono;
- non si riducono mai l'esito, la bozza, la copertura compatta, gli id dei casi e la voce di tracking dell'esecuzione;
- l'output completo resta nell'artefatto dell'esecuzione, recuperabile, e il payload ridotto dichiara che cosa ha
  tolto.

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

| Chi                                                                                                   | Che cosa cambia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/go/go-analyze-alarm` (`analyzeOccurrence`, `renderFinalSummary`)                             | elenco cronologico con copertura; niente «priority N» né caso primario                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `packages/go-watchtower-runbook` (`matchAnalysis`, `matchAnalysisAi`, `extractAnalysisEvidence`)      | i segnali si valutano **per coppia**: una rilevazione del runbook e **una** voce di tracking dell'analisi umana. `MATCH_EXACT` richiederebbe che contenuto del caso e identificatore tipizzato concordino sulla stessa rilevazione **e** sulla stessa voce umana. Con il contratto attuale di Watchtower non si emette (§3.9). Il testo unito di tutte le voci, o un identificatore di tipo o sorgente ambigui, non bastano per l'accordo esatto. Se concorda solo l'identificatore, l'esito è un conflitto, e il matcher AI non può trasformarlo in un accordo forte |
| `packages/go-watchtower-runbook` (`classifyRunbookOutcome`, `checkOccurrence`)                        | nuova classificazione per `inconclusive`, distinta da `MISS`, `NO-DATA` e `CONFIG-ERROR`; la copertura entra nel `RunbookCheck`                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `packages/go-watchtower-runbook` (`cache/runbookFingerprint.ts`)                                      | `EXPECTED_OUTPUT_SCHEMA_VERSION` (oggi `'1.0.0'`, ripetuto a mano) legge la costante esportata da go-runbook. Entra già nell'impronta, quindi le voci in cache della v1 vengono scartate                                                                                                                                                                                                                                                                                                                                                                              |
| `packages/go-watchtower-runbook` (`check/buildReport.ts`)                                             | lo `schemaVersion` del report RTA passa da `1.1.0` a `2.0.0`, con tipi e fixture aggiornati                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `scripts/go/go-rta-check` (`renderConsole`, `writeReport`)                                            | colonne e report con l'elenco delle rilevazioni e la copertura al posto di `primaryCaseId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `scripts/go/go-execute-runbook` (`executeRunbook`, `toCompleteAnalysisDraft`, `buildTrackingEntries`) | si adegua alla bozza (misura a runtime del §3.6) e all'outcome nuovi; `inconclusive` si traduce in `UNKNOWN_CASE` con la copertura nel `resultSummary`; le voci di tracking diventano per errore, con i campi di correlazione. Oppure si elimina prima con la catena descritta in [DRAFT-001](../../drafts/DRAFT-001-ExecuteRunbookRemoval/DRAFT-001-ExecuteRunbookRemoval-CLAUDE-v01.md)                                                                                                                                                                             |
| `packages/go-watchtower-runbook` (`checkOccurrence`, cache)                                           | un risultato con una voce di copertura `unavailable` **o con un'iterazione fallita** non entra in cache, nemmeno se un'altra sorgente ha dato un HIT: alla ripresa si interroga di nuovo. Una lettura che fallisce dentro un'iterazione registra la causa tipizzata (`unavailable`) oltre al fallimento. Il `detail` delle voci di copertura passa dalla stessa pulizia dei nomi di profilo AWS che oggi si applica a `check.error`, prima di entrare nel report                                                                                                      |
| `scripts/go/go-execute-runbook` (`buildTrackingEntries`) e la Lambda di go-watchtower                 | le voci di tracking per errore si mappano sui campi che il contratto di completamento già ammette (trace id, dettaglio, codice, istante), senza proprietà nuove. Lo slot dell'id d'esecuzione resta riservato. Le altre si scelgono in ordine di tempo entro le 64 voci del contratto. La correlazione completa e l'eventuale troncamento del tracking restano nell'output strutturato. La regola è la stessa nei due punti di callback                                                                                                                               |
| Reporter dei toolkit (`ApiGwServiceChainReporter`, `LambdaReporter`, `renderApiGwFinalSummary`)       | niente «← primario»; elenco con i tempi e, per errore, la sua traversata                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Lambda dei runbook in go-watchtower (repository a parte)                                              | legge `RunbookOutput` 2.0.0 e la bozza, applica la stessa misura a runtime prima dell'invio, e traduce `inconclusive` come il worker. Prima del rilascio si verifica come Watchtower applica un `UNKNOWN_CASE` con `resultSummary` di analisi parziale. Il contratto della bozza non cambia (D4)                                                                                                                                                                                                                                                                      |

### 3.9 Documentazione e rilascio

- `docs/RUNBOOKENGINE.md` (28 passaggi su priorità e risoluzione anticipata, compreso l'esempio didattico),
  `docs/ARCHITECTURE.md` (3) e il README di `go-runbook`.
- Un changeset per `@pagopa/go-runbook` che descrive la modifica incompatibile. Il repository è in pre mode `next`,
  quindi esce come `1.0.0-next.N`.
- **Condizione di rilascio verso Watchtower**: una fixture callback → rilettura sul ramo di go-watchtower che riceve
  le analisi. Oggi la proiezione del tracking conserva solo trace id e istante, e scarta identificatori oltre 255
  caratteri.
  - Codice e dettaglio devono arrivare nei campi di tracking dell'analisi. La proiezione è lavoro di go-watchtower;
    qui si fissa il requisito.
  - Entrambi i produttori di callback applicano i limiti più stretti fra callback e rilettura:
    - `errorCode` al più 200 caratteri;
    - `errorDetail` al più 2.000;
    - una voce con un identificatore oltre 255 caratteri si salta invece di troncarlo, così l'identità non si
      altera.
  - Il contratto attuale di Watchtower non ha tracking umano tipizzato: una voce umana ha solo `traceId`,
    `errorCode`, `errorDetail` e `timestamp`. Quindi, **con il contratto attuale, `MATCH_EXACT` non si emette**.
    L'accordo massimo è quello forte, e il report RTA lo dichiara.
  - `MATCH_EXACT` torna quando Watchtower esporrà tracking umano tipizzato, con una fixture di rilettura positiva.
- Un changeset per `@pagopa/go-aws`, nella stessa release di F1. Il risultato delle query Logs Insights espone l'indizio
  di altre pagine non lette (`nextToken`), che oggi si scarta. `@pagopa/go-runbook` richiede come minimo la versione di
  `@pagopa/go-aws` che lo porta, non solo `workspace:^`. Il controllo dei package pubblicati verifica il runbook
  impacchettato contro le dipendenze pubblicate, con una risposta sotto il limite e con altre pagine.
- Gli artefatti storici di `artifacts/runbook-automation/remediation/2026-10-17/` non si toccano.

### 3.10 Le fasi

Ogni fase si chiude con `pnpm check` verde.

1. **F1: i casi e la copertura.** Motore (§3.2), copertura degli step (§3.3), output (§3.5), bozza (§3.6), catalogo
   (§3.7), consumatori (§3.8), tempo negli aggregati e negli oggetti derivati interop, documentazione.
   - Basta da sola per interop k8s e interop API GW.
   - Per le famiglie del §1.3 riporta tutti i casi presenti nell'evidenza raccolta, ma su un solo errore, e dichiara
     gli altri come non esaminati.
   - Ogni famiglia del §1.3 sceglie dalla scansione immutabile **un errore attivo**, il più vecchio, e tutti i suoi
     lettori vedono solo quello: è la vista per errore del §3.4 con un solo errore.
     - In API GW è la riga dell'access log, la stessa per parser, authorizer, execution log e hook.
     - In Lambda è l'invocazione, con sorgente e requestId, la stessa per parser, query delle invocazioni (standard e
       multi-account), instradamento downstream e predicati dei casi.
     - In service e downstream è la riga d'errore con il suo trace.

     Gli altri errori si contano dalla scansione originale come non esaminati.
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
  - raccolta della copertura dagli step e dalle iterazioni;
  - visite ripetute: un servizio interrogato prima con il fallback UUID e poi con il trace id conserva le righe di
    entrambe le visite per l'evidenza;
  - uno step con `continueOnFailure` fallito dopo una rilevazione positiva: la rilevazione resta e l'evidenza non è
    completa.
- **Valutatore**:
  - minimo e massimo su più di 10 righe che corrispondono, con righe ordinate `desc`;
  - `pattern` su tutte le righe;
  - evidenza solo dai rami soddisfatti: un `or` con un ramo d'ambiente falso non porta evidenza;
  - una riga che soddisfa due rami conta una volta;
  - `not` non porta evidenza;
  - righe aggregate con `count`, gruppi ripetuti e intervalli che si sovrappongono;
  - oggetti con `supportingRows`: un caso BFF con `exists` su un gruppo `{ cid, logs }` prende il tempo delle righe
    della sequenza, non di tutti i log della richiesta;
  - gruppi del tracker con righe estranee prima e dopo quella che corrisponde: l'intervallo è quello del gruppo, con
    peso 1;
  - righe senza tempo;
  - formato del tempo Logs Insights (`2026-11-19 10:15:42.123`) normalizzato in UTC.
- **Copertura**:
  - query satura per righe = limite, e query con `nextToken` sotto il limite;
  - saturazione misurata prima di un filtro (hook di Stream) e conservata da una lettura memorizzata;
  - controllo `recordsMatched` di Logsaver;
  - aggregato saturo;
  - CID saltati;
  - multi-account con core e confinfo in entrambi gli ordini, con core satura e confinfo illeggibile nella stessa
    esecuzione: due voci, nessuna riga persa;
  - errore di account o di autorizzazione nel preflight: l'esecuzione fallisce;
  - execution log `unavailable` in `best-effort`;
  - hook di Stream e sonda B2B con lettura fallita;
  - B2B 504 «Endpoint request timed out» con identificatore mancante e con identificatore rifiutato: lettura
    `skipped`, `deliveryLogCount == '0'` non soddisfatto, niente `COMPLETED`;
  - ciascuno di questi casi rende l'evidenza non completa.
- **Callback**:
  - un messaggio rappresentativo Lambda di 600 KiB: `context.details` e `context.fields` limitati, forma compatta
    finale se serve, richiesta entro 1 MiB, output completo recuperabile dall'artefatto;
  - tracking: `errorCode` di 250 caratteri accorciato a 200, `errorDetail` di 2.025 accorciato a 2.000, voce con un
    identificatore di 300 caratteri saltata; la rilettura su go-watchtower conferma i valori;
  - venti rilevazioni con messaggi resi lunghi (errore applicativo interpolato): ogni messaggio entro 4.000 caratteri,
    richiesta intera entro 1 MiB, esito, bozza, copertura e tracking dell'esecuzione intatti, riduzione dichiarata;
  - la stessa misura nell'adattatore di completamento e nella Lambda;
  - fixture callback → rilettura su go-watchtower: codice e dettaglio arrivano nei campi di tracking dell'analisi.
- **Bozza**:
  - una rilevazione e nessuna riga di copertura, uguale alle fixture di oggi;
  - una rilevazione `COMPLETED` più un errore non riconosciuto, fallito o un'evidenza incompleta → `IN_PROGRESS` e
    riga di copertura;
  - una rilevazione `COMPLETED` più errori non esaminati in F1: righe di copertura sempre presenti, `IN_PROGRESS` e
    `ANALYZABLE` (D10 (b));
  - B2B in F1 con un 500 chiudibile più vecchio (`delivery-document-index-out-of-bounds`) e un 503 da lavorare più
    recente (`apigw-lambda-invocation-503`): `IN_PROGRESS` e `ANALYZABLE`;
  - contatori: nessun errore → `unexamined` 0; sorgente Lambda non disponibile → `observed` con `lowerBound`; solo
    righe Lambda non attribuite → contate nella loro popolazione e soggette alla regola di chiusura;
  - zero rilevazioni con errori esaminati per intero e non riconosciuti → `unknown-case`; zero rilevazioni con una
    lettura saltata o fallita → `inconclusive`;
  - più casi: note, regole di stato e di tipo, motivi di ignore diversi;
  - `inconclusive` → `UNKNOWN_CASE_CONTEXT` valido per lo schema, con la copertura nel `resultSummary`;
  - misura a runtime con testo multibyte e caratteri da escapare;
  - una prima voce con una risoluzione di 5.000 caratteri più le righe di copertura: identificazione e copertura
    restano, la risoluzione si accorcia;
  - due casi con 3.000 caratteri di `errorDetails` ciascuno: il campo resta entro 5.000;
  - liste facoltative vuote, riferimenti vicini al limite e due testi multibyte in competizione per i byte residui:
    la bozza finale resta entro 64 KiB con copertura e identificazione;
  - una fonte con un messaggio d'errore del provider molto lungo: la bozza porta solo il conteggio compatto;
  - la stessa funzione di misura all'adattatore di completamento e nella Lambda;
  - le fixture di `contracts/runbook-automation/v1/owned/fixtures/` validano ancora contro lo schema di Watchtower.
- **Analisi per errore**:
  - isolamento di variabili e output tra iterazioni;
  - viste per errore: `steps.<id>` nell'iterazione restituisce solo le righe dell'errore;
  - `goTo` e `stop` dentro il blocco;
  - iterazione fallita seguita da iterazioni riuscite;
  - abort globale;
  - validatori della costruzione: un caso che legge uno step del blocco si costruisce; id duplicati fra gli ambiti e
    `goTo` fra blocchi diversi sono rifiutati;
  - letture di finestra memorizzate: una sola query, condizione valutata per errore;
  - mutazione annidata nel blocco rifiutata da `assertCloudExecutableRunbook`;
  - servizi e account del blocco preparati dal preflight;
  - blocco incluso nel digest;
  - limite, saturazione e troncamento dichiarati;
  - identificatori non validi → evidenza non attribuita, mai interpolati;
  - traccia per iterazione.
- **Scenari di famiglia**:
  - **API GW, F1**: la richiesta più vecchia senza `errorMessage` e una più recente con: metadati e conteggio restano
    quelli della scansione e della riga attiva. Se la richiesta attiva di IO_EXP ha una firma d'integrazione non
    valida nell'execution log, la diagnosi `integration-signature-mismatch` c'è.
  - **API GW, InfoPa**: `pn-bff` prova un `ReadTimeoutException` e la lettura di `pn-external-registries` è satura
    senza una firma più specifica: la rilevazione BFF resta, grazie allo stato della lettura, e non porta a `COMPLETED`.
    Lo stesso per il timeout data-vault di B2B.
  - **API GW, IO_EXP**: il campione dell'execution log resta nell'output strutturato, con la chiave della richiesta
    che ha prodotto `integration-signature-mismatch`.
  - **API GW, F1, authorizer e lettura fallita**: un timeout dell'authorizer sulla richiesta attiva, poi
    `QueryServiceLogsStep` fallisce: la rilevazione resta, la lettura è `unavailable`, l'esecuzione non è `failed`,
    niente cache e niente `COMPLETED`.
  - **API GW, visite ripetute**: una visita con fallback che trova righe d'errore, poi una visita per trace completa e
    vuota: `LogCountAllVisits` non è zero, e la rilevazione d'assenza non compare.
  - **API GW, B2B 504**: con identificatore mancante o rifiutato, la lettura di `pn-delivery` è `skipped`,
    `deliveryLogCount` non esiste, e la rilevazione `apigw-endpoint-timeout-no-delivery-logs` non compare, anche su una
    seconda visita.
  - **API GW, F2**:
    - un timeout dell'authorizer sulla richiesta A e un errore di servizio sulla richiesta B: ciascuno si attribuisce
      alla sua richiesta, con i suoi metadati, anche negli hook di Stream;
    - sonda B2B dopo la traversata, con la query eseguita una volta;
    - lotto dell'execution log saturo da una richiesta verbosa.
  - **Lambda, F1**: in downstream-monitoring un S3 SlowDown sull'invocazione B e uno SlowDown generico sull'invocazione
    attiva A: il caso generico di A non viene escluso dall'evidenza di B; B si conta come non esaminata.
  - **Lambda**:
    - due timeout con `lambdaRequestId` diversi rendono due messaggi diversi e corretti;
    - righe senza `@requestId` ma con il requestId nel messaggio;
    - righe senza requestId valido → errore «non attribuito»;
    - le due varianti multi-account;
    - tre righe della stessa invocazione contano un'invocazione;
    - due righe senza requestId, uno SlowDown generico e uno S3 SlowDown: due errori non attribuiti, ciascuno con il
      suo caso, e righe non attribuite contate a parte;
    - DailyExport con una sorgente locale satura: nessun nome di profilo in `coverage.source`, nella correlazione o
      nella chiave d'errore.
  - **SelfcarePG**:
    - errore vuoto e timeout sullo stesso trace;
    - errore vuoto e timeout su trace diversi;
    - sullo stesso trace, un secondo errore più recente;
    - tutti anche in ordine inverso;
    - sullo stesso trace, un timeout di un'altra chiamata: si associa all'errore SelfcarePG, come dice il limite
      dichiarato del §3.4. Il test fissa il comportamento, non lo corregge.
  - **Workday**, con tempi espliciti:
    - in F1, con la riga attiva A, la più vecchia, che ha il solo `ERR_CONS_DUPLICATED_EVENT`: c'è la diagnosi
      sostenuta dalla riga A, e B si conta come non esaminata;
    - in F1, con una sola riga attiva che ha tutti e tre i marcatori: escono entrambi i casi che si sovrappongono;
    - in F4 la sostituzione toglie il caso generico solo dalla riga che prova anche quello specifico, e A conserva il
      suo.
  - **Interop**: un gruppo raro escluso da un aggregato saturo è dichiarato; il tempo del BFF arriva alla rilevazione.
  - **Interop, contesto del pod**: una lettura satura (righe = limite, o `recordsMatched` oltre le righe) conserva le
    righe; una rilevazione positiva resta e non porta a `COMPLETED`.
  - **SPID Hub e Logsaver**: la copertura riporta i conteggi e la correlazione manuale; il limite di righe di SPID Hub
    diventa `saturated` invece di un errore.
- **Catalogo**:
  - test di tutti i runbook aggiornati;
  - elenco delle sovrapposizioni rivisto voce per voce e allegato al registro della specifica;
  - controllo del tempo sulle query di evidenza e sulle trasformazioni;
  - baseline rigenerate.
- **Lettori**:
  - le voci di cache della v1 vengono scartate;
  - una sorgente `unavailable` con un HIT su un'altra: il risultato non entra in cache, e dopo il ripristino dei
    permessi la sorgente si interroga di nuovo con la stessa impronta;
  - una rilevazione positiva dell'authorizer seguita da una query di servizio fallita: il risultato non entra in cache,
    e il nuovo tentativo con la stessa impronta riesegue la query;
  - un report RTA con una sorgente `unavailable` il cui errore contiene un nome di profilo locale: il nome non compare;
  - il tracking con più di 64 errori resta entro le 64 voci, senza proprietà fuori contratto, e porta l'id
    d'esecuzione;
  - i report RTA vecchi e nuovi si distinguono per versione;
  - lo scenario A/B del matcher: un timeout umano sul trace A, il runbook trova un 403 su A e un timeout su B → non è
    `MATCH_EXACT`, in entrambi i matcher;
  - lo scenario incrociato dal lato umano: l'analisi umana riporta un 403 su A e un timeout su B, il runbook trova un
    timeout su A → non è `MATCH_EXACT`, e il matcher AI non lo promuove;
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
- **L'attribuzione dell'evidenza alla singola chiamata dentro un trace** (span, sequenza, endpoint), in service e
  downstream. Le righe d'errore dello stesso trace condividono l'evidenza del trace (§3.4, limite dichiarato).
- **Il tempo della singola riga dentro un gruppo del tracker dei CID**: si usa l'intervallo del gruppo (§3.2).
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
  con un caso solo e nessuna riga di copertura la bozza non cambia.
- **D5 · Stato e tipo con più casi.** Regole del §3.6: `COMPLETED` e `IGNORABLE` solo con chiusura automatica
  ammessa e tutti i casi concordi. **Proposta: queste regole.** Sostituiscono le fasce 200/500 senza perdere la
  garanzia che un caso benigno non nasconda lavoro da fare.
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
  gli altri come non esaminati, nell'unità della famiglia. D10 riguarda solo stato e tipo: le righe di copertura nelle
  note ci sono sempre.

  L'opzione «senza effetto su stato e tipo» delle versioni precedenti si toglie. Non è il comportamento di oggi:
  F1 sceglie l'errore più vecchio, non il più grave. In B2B un 500 chiudibile più vecchio
  (`delivery-document-index-out-of-bounds`) nasconderebbe un 503 da lavorare più recente
  (`apigw-lambda-invocation-503`). Restano due opzioni:
  - (b) con errori non esaminati la chiusura automatica non è ammessa: `IN_PROGRESS` e `ANALYZABLE`;
  - (c) F1 conserva, solo per la scelta dell'errore attivo, l'ordine per gravità di oggi, e gli errori non esaminati
    non pesano su stato e tipo. Anche così la priorità sopravvive nascosta fino a F2–F4.

  **Proposta: (b)**, ed è la regola scritta nel §3.6. Toglie la chiusura automatica alle occorrenze con più errori
  finché F2–F4 non le analizzano tutti, ma non chiude mai un'occorrenza con lavoro nascosto.
