# SPEC-002 · Runbook Automation: tutti gli errori, in ordine di tempo — v01

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: la richiesta del committente del 19 novembre 2026

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

### 1.3 Due famiglie scelgono un solo errore prima ancora dei casi

Togliere la priorità dai casi non basta. Due famiglie riducono l'evidenza a **un errore rappresentativo** prima che i
casi vengano valutati:

- **SEND API Gateway** (9 runbook). `ParseApiGwErrorsStep` ordina le righe in errore dell'access log per gravità
  (status più alto) e tiene solo la prima: status, path, messaggio e trace id finiscono in variabili scalari
  (`apiGwStatusCode`, `apiGwErrorMessage`, `xRayTraceId`, …). `QueryServiceLogsStep` interroga poi i servizi **con
  quel solo trace id**. Le altre richieste fallite nella finestra non vengono mai analizzate. L'ordinamento per gravità
  è una seconda priorità, nascosta.
- **Lambda** (12 runbook). `scanLambdaLogs` dà una categoria sola a tutta la finestra (`timeout` vince su tutto) e un
  messaggio rappresentativo. La query degli errori è `sort @timestamp desc`, quindi il "primo" è il più recente.

Anche molte variabili `*ErrorMsg` dei servizi SEND sono estratte dalla prima riga che corrisponde. In tutto **26 delle
circa 245 condizioni** del catalogo si basano solo su variabili scalari, senza righe di log come evidenza. Sono quasi
tutte API GW e Lambda.

Le famiglie interop k8s, interop API GW, downstream e service confrontano invece i casi con **tutte** le righe della
query (`stepEvidenceMatches`, cioè `contains` con regex sull'output dello step). Per loro basta il lavoro sui casi.

### 1.4 La priorità porta significati che nessuno dichiara

Nel catalogo ci sono **302 valori di `priority`** su 72 runbook (38 SEND, 34 interop), più 4 nei casi condivisi dei
toolkit. Oltre all'ordine, il numero codifica regole che non stanno scritte da nessuna parte:

1. **Fasce di sicurezza.** `pn-delivery-B2B-ApiGwAlarm/knownCases.ts`: «Actionable/manual cases use the 500 range.
   Automatically closable cases use the 200 range, so a benign overlap can never hide work still required». La
   priorità impedisce che un caso chiudibile in automatico (`COMPLETED`) nasconda un caso che richiede lavoro.
2. **Specifico sopra generico.** I casi «API Gateway 500 senza log applicativi correlati» (`GENERIC_API_GATEWAY_500`)
   si sovrappongono a ogni causa specifica di un 500.
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
- le query ordinano a volte `asc` e a volte `desc`: la prima riga trovata non è la più vecchia;
- le variabili scalari (`vars.*`) non hanno tempo.

Oggi quindi non si può ordinare per tempo neanche ciò che già si trova.

## 2. Che cosa vede chi usa il repository

- **Chi analizza un allarme** (console di `go-analyze-alarm` e `go-rta-check`) vede l'elenco di tutti i casi noti
  individuati, dal più vecchio al più recente, ciascuno con la prima e l'ultima volta in cui si è visto e il numero di
  righe di evidenza. Non c'è più un caso "primario".
- **Watchtower** riceve ancora **un'analisi per occorrenza**. Se il caso è uno solo, la bozza resta identica a oggi.
  Se sono più di uno, `conclusionNotes` elenca i casi in ordine di tempo con le loro risoluzioni, e stato e tipo
  seguono regole esplicite (§3.5) invece della priorità.
- **Chi scrive un runbook** non dichiara più `priority`. Quando due casi descrivono lo stesso errore (uno generico e
  uno specifico, o uno condiviso e la sua versione locale), lo dice con `supersedes` (§3.2). Non esiste più
  `next: 'resolve'`.
- **Chi rilascia**: è una modifica incompatibile di `@pagopa/go-runbook`, ancora in prerelease (`next`). La Lambda di
  go-watchtower che importa il package va adeguata insieme (§3.7).

## 3. La proposta

### 3.1 Il modello: la rilevazione

Al posto di "il caso che vince" il risultato diventa un elenco di **rilevazioni**. Una rilevazione è un caso noto che
corrisponde all'evidenza, con il suo tempo:

```typescript
interface KnownCaseDetection {
  readonly knownCase: KnownCase;
  /** Prima riga di evidenza che soddisfa il caso (ISO-8601 UTC); assente se l'evidenza non ha tempo. */
  readonly firstSeenAt?: string;
  /** Ultima riga di evidenza che soddisfa il caso. */
  readonly lastSeenAt?: string;
  /** Righe di evidenza che soddisfano il caso (tutte, non solo i campioni della traccia). */
  readonly evidenceCount: number;
}
```

**Ordine**: `firstSeenAt` crescente. A parità di tempo vale l'ordine di dichiarazione nel runbook. Le rilevazioni
senza tempo vanno in fondo, anch'esse nell'ordine di dichiarazione (D7). L'ordine è deterministico: lo stesso input
produce sempre lo stesso elenco.

### 3.2 Il motore

- **`KnownCase.priority` sparisce**. I casi si valutano nell'ordine di dichiarazione e la validazione
  `DUPLICATE_CASE_PRIORITY` si toglie.
- **`supersedes?: readonly string[]`** sul caso (D3). Se il caso X corrisponde, i casi elencati in `X.supersedes` si
  tolgono dalle rilevazioni: restano nella traccia con `supersededBy: 'X'`. Il builder rifiuta id inesistenti, un caso
  che sostituisce sé stesso e i cicli (`UNKNOWN_SUPERSEDED_CASE`, `SUPERSEDES_CYCLE`). È una relazione locale tra due
  casi ("questo è una spiegazione più precisa dello stesso errore"), non un ordine globale. Serve solo dove due casi
  descrivono lo stesso errore. Due errori diversi restano due rilevazioni.
- **Il tempo dell'evidenza.** `RunbookEngineOptions` riceve un lettore iniettato
  `evidenceTime?: (element: unknown) => number | undefined`, come oggi riceve il `logActionRenderer`. Così il motore
  non conosce il formato delle righe CloudWatch. Il toolkit comune fornisce il lettore delle righe Logs Insights:
  `@timestamp`, poi `timestamp`, normalizzati in UTC. Nella valutazione dettagliata il `ConditionEvaluator` calcola,
  per ogni predicato su un array che corrisponde, il minimo e il massimo tempo e il conteggio su **tutte** le righe
  che corrispondono, non solo sui 10 campioni. `pattern` in modalità dettagliata non si ferma più alla prima riga: il
  costo resta O(N), come `contains`. Composizione: `and` e `or` uniscono i tempi dei rami che corrispondono, `not` non
  porta tempo.
- **`RunbookExecutionResult.matchedCases` diventa `detections`**: `ReadonlyArray<KnownCaseDetection>`, in ordine di
  tempo.
- **Azioni**: il motore esegue l'azione di ogni rilevazione, in ordine di tempo (D6). Il fallback gira solo se non c'è
  nessuna rilevazione. Nel catalogo tutte le azioni sono `log`: oggi nessun caso usa `notify`, `escalate` o `update`.
- **`'resolve'` sparisce** da `FlowDirective` (D2), insieme a `EarlyResolutionTrace`, `earlyResolution` e
  `resolvedAtStep`. Gli step che lo emettono restituiscono `continue`. `stop` resta per i casi in cui la pipeline non
  ha davvero altro da fare: per esempio `ParseApiGwErrorsStep` con zero errori.
- **Traccia**: `CaseEvaluationTrace` perde `priority` e guadagna `firstSeenAt`, `lastSeenAt`, `evidenceCount` e
  `supersededBy`. `CaseMatchingTrace.matchedCaseIds` segue l'ordine delle rilevazioni.

### 3.3 L'analisi per errore (API Gateway e Lambda)

Per le due famiglie del §1.3 si analizza **ogni errore** della finestra, non uno solo (D1).

- **Il costrutto.** Uno step "enumeratore" restituisce gli errori trovati:

  ```typescript
  interface DetectedError {
    readonly occurredAt: string; // ISO-8601 UTC
    readonly key: string; // requestId, trace id, …: identifica l'errore nel risultato
    readonly vars: Readonly<Record<string, string>>;
  }
  ```

  Il builder dichiara il tratto di pipeline da ripetere (`perError([...steps])`). Il motore lo esegue una volta per
  errore, in ordine di `occurredAt`, con un **contesto isolato**: parametri e variabili condivise più le variabili
  dell'errore. Variabili e output scritti in un'iterazione non passano alla successiva. I casi si valutano **per
  errore**, così le condizioni sulle variabili scalari (`apiGwStatusIs('500')`, `lambdaErrorCategory`) restano valide
  così come sono. Se l'evidenza di un caso non ha tempo, il caso prende il tempo dell'errore: le 26 condizioni senza
  righe del §1.3 ottengono così un tempo. Per l'iterazione si parte da `executeSubPipeline`, che esiste già.

- **SEND API Gateway.** `ParseApiGwErrorsStep` diventa l'enumeratore: un errore per ogni richiesta in errore
  dell'access log (requestId e trace id), in ordine di tempo, senza l'ordinamento per gravità. La traversata dei
  servizi gira per ogni errore.
- **Lambda.** `ParseLambdaErrorsStep` raggruppa le righe per `@requestId` e restituisce un errore per invocazione,
  ciascuno con la sua categoria (`timeout`, `out-of-memory`, …).
- **Limite** (D8). Al massimo N errori per esecuzione, i più vecchi per primi (proposta: 20, configurabile per
  runbook). Il troncamento non è mai silenzioso: l'output dice «analizzati 20 errori su 57», le note della bozza lo
  ripetono e lo stato proposto diventa `IN_PROGRESS`.
- **Errori senza caso.** Un errore enumerato che non corrisponde a nessun caso resta nel risultato come errore non
  riconosciuto, con il suo tempo.
- **Costo.** Le query ai servizi si moltiplicano per il numero di errori. Prima del rilascio si misura con
  `go-rta-check` su occorrenze reali, in sola lettura: query, durata, righe scansionate, prima e dopo. Se serve, si
  ottimizza raggruppando in una sola query per servizio i trace id di più errori, con una clausola `OR`, come fa già
  l'execution log con i requestId (fino a 50 per query). L'ottimizzazione resta fuori finché le misure non la chiedono.

Le famiglie interop k8s, interop API GW, downstream e service non hanno l'enumeratore: le loro rilevazioni prendono il
tempo dalle righe (§3.2). Durante lo sviluppo si verifica, famiglia per famiglia, che nessuno step riduca l'evidenza a
una sola riga prima dei casi.

### 3.4 L'output del runbook

`RunbookOutput.schemaVersion` passa a `2.0.0`.

- `outcome.kind: 'known-case-matched'` perde `primaryCaseId`, `primaryCaseDescription` e `matchedCases[].priority`.
  Guadagna `detections[]`, in ordine di tempo: `caseId`, `description`, `firstSeenAt?`, `lastSeenAt?`,
  `evidenceCount`, `errorKey?` (con l'analisi per errore) e `resolvedMessage`. `resolvedMessage` si risolve per ogni
  caso, non più solo per il primo.
- Con l'analisi per errore: `errors[]` con `occurredAt`, `key` e le rilevazioni dell'errore, più `unrecognizedErrors`
  e `truncated` (`analyzed`, `total`).
- Messaggio: «Individuato caso noto: …» se il caso è uno, «Individuati N casi noti: …» se sono di più.
- `execution.earlyResolution` e `execution.resolvedAtStep` spariscono.

### 3.5 La bozza per Watchtower

Il contratto `AnalysisDraftV1` di Watchtower resta com'è (D4): un'analisi per occorrenza, `conclusionNotes` di al
massimo 5.000 caratteri, `additionalProperties: false`.

- **Una rilevazione**: la bozza è identica a quella di oggi. Si verifica con le fixture attuali.
- **Più rilevazioni**: `conclusionNotes` è un elenco numerato in ordine di tempo, con una voce per caso:
  `1. 2026-11-19 10:15:42 UTC — <descrizione>: <risoluzione interpolata>`, più `(N volte fino alle …)` quando il caso
  si ripete. Se si supera il limite di 5.000 caratteri, le voci restano intere e in ordine e l'ultima riga diventa
  «… e altri K casi (vedi l'esecuzione)». `errorDetails` unisce i dettagli dei casi in ordine di tempo, con lo stesso
  limite.
- **`proposedStatus`** (D5): `COMPLETED` solo se **tutte** le rilevazioni sono `COMPLETED` e non ci sono errori non
  riconosciuti né troncamento; altrimenti `IN_PROGRESS`. È la regola delle fasce 200/500 del §1.4, scritta in chiaro
  e valida per tutti i runbook.
- **`analysisType`** (D5): `IGNORABLE` solo se **tutte** le rilevazioni sono `IGNORABLE` con lo stesso
  `ignoreReasonCode` e gli stessi `ignoreDetails`; altrimenti `ANALYZABLE`, senza campi di ignore.
- **Liste** (`resources`, `downstreams`, `finalActions`, `links`): unione come oggi, prima i default e poi i casi in
  ordine di tempo, senza duplicati.
- **Errori non riconosciuti senza nessuna rilevazione**: `UNKNOWN_CASE_CONTEXT`, come oggi.
- **Validazione statica** (`buildPotentialAnalysisDrafts`, `assertAnalysisAnnotations`): il caso peggiore diventa
  "tutti i casi annotati insieme", senza ordinamento per priorità. Per le liste è già così oggi, perché il primo caso
  si unisce a tutti i successivi. Per `conclusionNotes` vale il troncamento a runtime; il limite statico resta sulla
  singola risoluzione.

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
   - i casi «500 senza log correlati» → da verificare, perché alcuni sono già esclusivi grazie a `not(varExists(...))`.

   Restano come sono le 7 condizioni con `not(...)`, il condizionamento del BFF InfoPa e i casi dell'authorizer.

3. **Le fasce 200/500** e il loro commento si tolgono: la regola diventa quella del §3.5.
4. **`'resolve'`**: i 5 step del catalogo e i 5 dei toolkit restituiscono `continue`.
5. **Tempo nelle query di evidenza**: un controllo alla registrazione verifica che ogni query usata come evidenza dei
   casi proietti `@timestamp`. Le query che non lo fanno si correggono.
6. **Baseline**: `__baseline__/canonical.json` e `fingerprints.json` si rigenerano (la priorità entra nell'impronta di
   ogni runbook con casi), e cambia il `definitionDigest`. Non serve migrare nessun catalogo: il catalogo automatico
   non è mai stato rilasciato.

### 3.7 Chi legge i risultati

| Chi                                                                                             | Che cosa cambia                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/go/go-analyze-alarm` (`analyzeOccurrence`, `renderFinalSummary`)                       | elenco cronologico; niente «priority N» né caso primario                                                                                                                                             |
| `packages/go-watchtower-runbook` (`matchAnalysis`, `matchAnalysisAi`, `checkOccurrence`)        | il confronto con l'analisi umana considera **tutte** le rilevazioni: concorda se una di esse spiega l'analisi umana                                                                                  |
| `scripts/go/go-rta-check` (`renderConsole`, `writeReport`)                                      | colonne e report con l'elenco delle rilevazioni al posto di `primaryCaseId`                                                                                                                          |
| `scripts/go/go-execute-runbook` (`executeRunbook`, `toCompleteAnalysisDraft`)                   | si adegua alla bozza e all'outcome nuovi, oppure si elimina prima con la catena descritta in [DRAFT-001](../../drafts/DRAFT-001-ExecuteRunbookRemoval/DRAFT-001-ExecuteRunbookRemoval-CLAUDE-v01.md) |
| Reporter dei toolkit (`ApiGwServiceChainReporter`, `LambdaReporter`, `renderApiGwFinalSummary`) | niente «← primario»; elenco con i tempi                                                                                                                                                              |
| Lambda dei runbook in go-watchtower (repository a parte)                                        | legge `RunbookOutput` 2.0.0 e la bozza; il contratto della bozza non cambia (D4)                                                                                                                     |

### 3.8 Documentazione e rilascio

- `docs/RUNBOOKENGINE.md` (28 passaggi su priorità e risoluzione anticipata, compreso l'esempio didattico),
  `docs/ARCHITECTURE.md` (3) e il README di `go-runbook`.
- Un changeset per `@pagopa/go-runbook` che descrive la modifica incompatibile. Il repository è in pre mode `next`,
  quindi esce come `1.0.0-next.N`.
- Gli artefatti storici di `artifacts/runbook-automation/remediation/2026-10-17/` non si toccano.

### 3.9 Le fasi

Ogni fase si chiude con `pnpm check` verde.

1. **F1: i casi.** Motore (§3.2), output (§3.4), bozza (§3.5), catalogo (§3.6), consumatori (§3.7), documentazione.
   Basta da sola per interop, downstream e service. Per API GW e Lambda riporta già tutti i casi presenti
   nell'evidenza raccolta, ma su un solo errore. Per coerenza col tempo, l'errore rappresentativo di API GW diventa
   il più vecchio invece del più grave.
2. **F2: analisi per errore, SEND API Gateway** (§3.3), con la misura dei costi su occorrenze reali.
3. **F3: analisi per errore, Lambda** (§3.3).

## 4. Test e verifica

- **Motore**:
  - valutazione nell'ordine di dichiarazione;
  - ordine cronologico, parità di tempo e rilevazioni senza tempo;
  - `supersedes`: rimozione, traccia ed errori di validazione;
  - esecuzione di tutte le azioni nell'ordine;
  - nessuna traccia di `'resolve'` nei tipi né nel motore.
- **Valutatore**:
  - minimo e massimo su più di 10 righe che corrispondono, con righe ordinate `desc`;
  - `pattern` su tutte le righe;
  - `and`/`or`/`not`;
  - righe senza `@timestamp`;
  - formato del tempo Logs Insights (`2026-11-19 10:15:42.123`) normalizzato in UTC.
- **Bozza**:
  - con un caso, uguale alle fixture di oggi;
  - con più casi: note, troncamento a 5.000 caratteri, regole di stato e di tipo, motivi di ignore diversi;
  - errori non riconosciuti e troncamento che forzano `IN_PROGRESS`;
  - le fixture di `contracts/runbook-automation/v1/owned/fixtures/` validano ancora contro lo schema di Watchtower.
- **Analisi per errore**:
  - isolamento delle variabili tra iterazioni;
  - ordine degli errori;
  - casi su variabili scalari valutati per errore;
  - limite e troncamento dichiarato;
  - traccia per iterazione.
- **Catalogo**:
  - test di tutti i runbook aggiornati;
  - elenco delle sovrapposizioni rivisto voce per voce e allegato al registro della specifica;
  - controllo `@timestamp` sulle query di evidenza;
  - baseline rigenerate.
- **Verifica reale, in sola lettura**: `go-rta-check` su occorrenze recenti dei runbook API GW, Lambda e interop, prima
  e dopo. Si confrontano casi trovati, ordine, query, durata e accordo con le analisi umane in Watchtower.
- **Gate**: `pnpm check` e `pnpm lint`, compresi `check:published` e `check:published:sources` per il package
  pubblicato.

## 5. Fuori da questa specifica

- **Un contratto Watchtower v2** con un elenco strutturato di casi (`cases[]`) al posto delle note composte. Vale se
  si vuole che Watchtower mostri e filtri i singoli casi. Richiede lavoro nel repository go-watchtower (D4).
- **Il raggruppamento delle query per trace id** nell'analisi per errore, finché le misure non lo chiedono (§3.3).
- **Il raggruppamento degli errori per firma** (stesso status, path e messaggio), analizzando un solo errore per
  gruppo. Riduce le query, ma ripropone un errore "rappresentativo": due richieste con la stessa firma possono avere
  cause diverse a valle. È l'alternativa a D8.
- **Le righe di errore che nessun caso spiega** nelle famiglie senza enumeratore (k8s, downstream, service). È D9.
- **Le azioni `notify`, `escalate`, `update` e `composite`**: nessun caso del catalogo le usa. Toglierle è una pulizia
  a parte.
- **La priorità degli allarmi** in Watchtower e in `go-watchtower-client`: è un'altra cosa e non si tocca.

## 6. Le scelte del committente

- **D1 · Fin dove arrivare.**
  - (a) Solo i casi (F1): tutti i casi noti sull'evidenza raccolta, ma API GW e Lambda continuano ad analizzare un
    errore solo.
  - (b) Casi più analisi per errore (F1+F2+F3): tutti gli errori della finestra.

  **Proposta: (b)**, a fasi, con F1 rilasciabile da sola. Solo con (b) "tutti gli errori" vale anche per API GW e
  Lambda.

- **D2 · La risoluzione anticipata.** Toglierla del tutto, oppure tenerla come ottimizzazione. **Proposta: toglierla.**
  Se la pipeline si ferma al primo caso trovato, non si possono avere tutti gli errori. Dove la pipeline non ha
  davvero altro da fare c'è già `stop`.
- **D3 · Sovrapposizioni tra casi.**
  - (a) `supersedes` sul caso;
  - (b) solo `not(...)` nelle condizioni, come già fanno 7 casi;
  - (c) un flag `catchAll` (il caso si riporta solo se non ne corrisponde nessun altro).

  **Proposta: (a).** Copre sia il caso generico sia la sostituzione di un caso condiviso, il builder la valida e non
  allunga le condizioni. (b) resta disponibile. (c) non copre la sostituzione.

- **D4 · Il contratto della bozza.** Tenere `AnalysisDraftV1` e comporre le note in ordine di tempo, oppure aprire una
  v2 con `cases[]` in go-watchtower. **Proposta: tenere la v1.** Nessun lavoro nell'altro repository, e con un caso
  solo la bozza non cambia.
- **D5 · Stato e tipo con più casi.** Regole del §3.5: `COMPLETED` solo se tutti i casi lo sono; `IGNORABLE` solo se
  tutti lo sono con lo stesso motivo. **Proposta: queste regole.** Sostituiscono le fasce 200/500 senza perdere la
  garanzia che un caso benigno non nasconda lavoro da fare.
- **D6 · Le azioni.** Eseguire le azioni di tutte le rilevazioni in ordine di tempo, oppure solo della prima in ordine
  di tempo. **Proposta: tutte.** Nel catalogo sono solo `log`, e l'operatore deve vedere ogni caso.
- **D7 · Rilevazioni senza tempo.** In fondo all'elenco, nell'ordine di dichiarazione. **Proposta: sì.** Con (b) di D1
  restano solo i casi su variabili fuori dall'analisi per errore.
- **D8 · Il limite dell'analisi per errore** (solo con D1 (b)). **Proposta: 20 errori per esecuzione**, i più vecchi
  per primi, configurabile per runbook, con troncamento dichiarato e `IN_PROGRESS`. L'alternativa è il raggruppamento
  per firma del §5.
- **D9 · Righe di errore non spiegate** (famiglie senza enumeratore). Ignorarle come oggi, oppure contarle e riportarle
  nell'output, senza effetto sullo stato. **Proposta: contarle e riportarle**, solo come informazione. Si decide se
  farle pesare sullo stato dopo averle viste sulle occorrenze reali: alcune query restituiscono anche righe di
  contesto che non sono errori.
