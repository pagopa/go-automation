# go-runbook: analisi di semplificazione dopo la riorganizzazione

Data: 15 novembre 2026. Revisione analizzata: `80b83276`. Package: `@pagopa/go-runbook`, versione `0.0.0`.

## Valutazione complessiva

La separazione tra engine, toolkit, inventario e runtime è una buona base da conservare. La riduzione più utile ora consiste nell'eliminare ripetizioni locali e passaggi ridondanti, mantenendo la rappresentazione serializzata dei runbook. Una nuova gerarchia generale di step o un nuovo linguaggio per descrivere i casi noti aggiungerebbero complessità prima di produrre un beneficio dimostrato.

Le priorità sono:

1. Estrarre piccoli frammenti identici di output, reporting e casi noti.
2. Eliminare il doppio controllo delle capability senza cambiare l'ordine dei controlli preliminari.
3. Condividere il percorso di valutazione del primo elemento corrispondente in `ConditionEvaluator`.
4. Ridurre la superficie esportata soltanto dove si accetta una modifica dell'API.
5. Valutare separatamente le ottimizzazioni che riducono allocazioni ma possono aumentare le righe di codice.

Non emerge una grande quantità di file sicuramente morti. Emergono invece export pubblici senza consumatori individuati e alcuni export utilizzati soltanto nello stesso modulo. Sono categorie diverse: non vanno eliminati automaticamente.

## Perimetro e metodo

Il censimento comprende tutti i 1.078 file TypeScript sotto `src`, inclusi test e helper dei test. Sono state eseguite analisi automatiche dell'utilizzo e delle duplicazioni sull'intero perimetro configurato, ricerche dei consumatori nel monorepo e letture approfondite dei componenti di esecuzione, contesto, condizioni, azioni, builder, registry, account, output e delle principali ripetizioni nell'inventario.

Non si tratta di una lettura manuale integrale delle 75.141 righe: le conclusioni puntuali sotto sono sostenute dalla lettura dei file citati. Le proposte sulle famiglie più ampie sono candidate da applicare progressivamente, non equivalenze già dimostrate per tutti i runbook. Non sono stati eseguiti benchmark o chiamate AWS reali. Il codice applicativo non è stato modificato.

| Area                      | File non-test | Righe non-test | File test/helper | Righe test/helper |
| ------------------------- | ------------: | -------------: | ---------------: | ----------------: |
| Entrypoint root           |             1 |             24 |                0 |                 0 |
| Engine                    |            95 |          5.290 |               35 |             2.811 |
| Toolkit common            |           208 |         11.299 |               76 |             8.001 |
| Toolkit SEND              |            43 |          2.884 |               15 |             3.161 |
| Toolkit INTEROP           |            63 |          2.731 |               19 |             1.446 |
| Inventory                 |           360 |         15.271 |              131 |            20.137 |
| Runtime                   |            21 |            932 |                8 |               891 |
| Test trasversali/baseline |             0 |              0 |                3 |               263 |
| **Totale**                |       **791** |     **38.431** |          **287** |        **36.710** |

Le righe includono commenti e righe vuote. Sono presenti 72 file `registration.ts`. I JSON di baseline non sono inclusi nel conteggio TypeScript.

Configurazione: ESM nativo, `NodeNext`, TypeScript 6.0.3, project references verso `go-common` e `go-aws`, strict checking, `exactOptionalPropertyTypes`, `isolatedDeclarations`, `noUncheckedIndexedAccess`. Node utilizzato per le verifiche: 26.12.1; non è una verifica sulla versione minima supportata, 22.19.0.

### Verifiche eseguite

| Verifica                                                           | Esito                                                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @pagopa/go-runbook build`                           | Passa (`tsc -b`).                                                                                                                      |
| `pnpm --filter @pagopa/go-runbook test`                            | 1.836 test, 339 suite, zero fallimenti o skip; circa 10,7 secondi nel run osservato.                                                   |
| Knip con workspace selezionato e `--include-entry-exports`         | 11 file segnalati, 11 export di valori e 19 export di tipi; nessun file o dipendenza inutilizzata segnalati con questa configurazione. |
| jscpd con soglia 70 token, inventory incluso e test esclusi        | 19 cloni; 310 righe duplicate, 0,9234% su 33.570 righe conteggiate dal tool, 423 sorgenti.                                             |
| Riproduzioni locali di due comportamenti delle azioni/sub-pipeline | Confermati; dettagli nella sezione dedicata.                                                                                           |

Il denominatore di jscpd è quello del tool, non tutte le 38.431 righe non-test. Include blocchi poco significativi, come import ripetuti; non individua tutte le somiglianze semantiche. Le 310 righe duplicate non equivalgono a 310 righe sicuramente eliminabili.

La configurazione ordinaria `.jscpd.json` esclude `src/inventory/**`: la scansione aggiuntiva è servita proprio a includerlo. `knip.config.ts` ignora i barrel `index.ts`; anche l'esito di Knip va quindi letto entro questo limite.

## Interventi proposti

Priorità A: prima tranche di riduzioni. Priorità B: interventi utili con maggiore attenzione alla compatibilità. Priorità C: ottimizzazioni da misurare prima dell'adozione. Gli intervalli di riduzione sono stime di pianificazione sulle porzioni indicate, includono commenti e non sono addizionabili senza un diff reale.

### R1 — Condividere il contesto dell'allarme nei builder di output — A

**Evidenza:** [API Gateway](../packages/go-runbook/src/toolkits/common/families/apigw/output/buildApiGwOutputContext.ts), [Lambda](../packages/go-runbook/src/toolkits/common/families/lambda/output/buildLambdaOutputContext.ts), [service](../packages/go-runbook/src/toolkits/common/families/service/output/buildServiceOutputContext.ts), [output dichiarato](../packages/go-runbook/src/toolkits/common/output/buildDeclaredOutputContext.ts).

Il blocco `alarm` ripete lettura e normalizzazione di nome, timestamp iniziale/finale e finestra temporale. Anche i primi campi leggibili del risultato sono ripetuti. jscpd segnala la ripetizione su più builder.

**Proposta:** un helper locale di dominio `buildAlarmOutput(params)` e, se il risparmio netto lo giustifica, uno per i due campi comuni. Mantenere distinti i dettagli delle famiglie. Usare gli attuali `optionalString` e `addResultField` per conservare il trattamento di stringhe vuote, spazi e `-`.

**Beneficio:** una sola definizione dei campi comuni, nessun cambio di query o flusso; stima 25–50 righe nette. **Vincoli:** stesso ordine dei campi, stesse proprietà omesse e stessa struttura `timeRange`, anche quando vuota. Verificare gli output dei runbook e il test runtime `contextEvidence`.

**R1 applicato:** estratto `output/buildAlarmOutput.ts`, usato dai quattro builder. Il tipo interno `AlarmOutput` sostituisce le due dichiarazioni identiche nei contesti Lambda e service; il contratto API Gateway conserva la propria `timeRange` opzionale. Nessun nuovo export nei barrel pubblici. Saldo effettivo, inclusi i due nuovi file: **17 righe TypeScript in meno** (724 → 707 nei file coinvolti), inferiore alla stima iniziale. Non è stato estratto un secondo helper per i due campi leggibili dell'allarme: su sole tre chiamate avrebbe aumentato il codice complessivo. Build, lint sui file modificati, formattazione e tutti i 1.836 test passano, incluse le baseline esistenti senza aggiornamenti. Verificati inoltre sei casi locali di normalizzazione, omissione delle proprietà, finestre vuote/parziali e ordine delle chiavi JSON.

### R2 — Condividere la costruzione dell'evidenza log-sample — A

Negli stessi builder di R1 ricorrono il controllo della presenza dei log, `type: 'log-sample'`, la conversione `logLineToRecord` e il calcolo di `truncated`.

**Proposta:** una funzione piccola che riceva id, label, source step, campione e criterio di troncamento e restituisca zero o una evidenza. Lasciare ai chiamanti il valore di `truncated`: alcuni usano il totale delle righe, altri un conteggio già salvato nelle variabili.

**Beneficio:** riduzione stimata 20–45 righe nei builder coinvolti, senza ordinamenti aggiuntivi. **Rischio:** ricavare sempre il totale dalla lunghezza del campione cambierebbe il significato dell'evidenza; evitare questa scorciatoia.

### R3 — Unificare il messaggio di query fallita — A

**Evidenza:** `queryFailed` di [ApiGwReporter](../packages/go-runbook/src/toolkits/common/families/apigw/reporting/ApiGwReporter.ts) e [LambdaReporter](../packages/go-runbook/src/toolkits/common/families/lambda/reporting/LambdaReporter.ts). jscpd individua un blocco di 21 righe.

**Proposta:** condividere la costruzione del `TreeNode` relativo alla query fallita. Mantenere i metodi dei reporter come deleghe, preservando la superficie pubblica. Non serve una superclass dei reporter.

**Beneficio:** circa 8–15 righe nette e messaggi uniformi. **Verifica:** zero/uno/più log group, ordine dei figli, carattere del banner e gestione del flush. La piccola delega è preferibile a cambiare tutte le chiamate.

### R4 — Accorpare il matching del primo elemento nelle condizioni — A

**Evidenza:** [ConditionEvaluator](../packages/go-runbook/src/engine/core/ConditionEvaluator.ts), in particolare `evaluateCompare`, `evaluatePattern` e il ramo `contains.value`. Compare e pattern condividono ciclo, salto di null/undefined e dettaglio della prima corrispondenza; jscpd rileva 22 righe duplicate.

**Proposta:** helper privato che scorra l'array con un predicato, senza costruire array intermedi, e costruisca il dettaglio compatto solo quando richiesto. Conservare fuori dall'helper il comportamento scalare e la compilazione della regex.

**Beneficio:** 20–40 righe nette stimate e possibilità di evitare alcune allocazioni in modalità solo booleana. **Vincolo fondamentale:** `contains.regex` conta tutte le corrispondenze e conserva fino a dieci campioni; non deve essere convertito nel percorso first-match. Preservare inoltre il percorso dettagliato che visita tutti i rami logici e le chiavi `ref#2`, `ref#3`.

### R5 — Eliminare il doppio controllo delle capability — A/B

**Evidenza:** [OperationalRunbookEngine.execute](../packages/go-runbook/src/toolkits/common/engine/OperationalRunbookEngine.ts) chiama `assertRequiredServices`, poi `assertAwsAccounts`, poi [RunbookEngine.execute](../packages/go-runbook/src/engine/core/RunbookEngine.ts), che richiama `assertRequiredServices` con le medesime capability.

Inoltre `assertAwsAccounts` percorre nuovamente `collectRunbookSteps`. Il percorso operativo comporta quindi tre raccolte degli step per questi controlli.

**Proposta:** attribuire a un solo livello il controllo delle capability e offrire un punto di composizione interno per il controllo account dopo le capability e prima dell'esecuzione. In alternativa condividere un piccolo piano di preflight limitato alla singola esecuzione. Valutare il saldo di codice: un framework di hook generico per risparmiare una chiamata non sarebbe un miglioramento.

**Beneficio:** meno traversate e un solo proprietario del controllo. Risparmio di righe modesto; beneficio principale di flusso e manutenzione. **Vincoli:** mantenere l'errore di servizio mancante prima dell'accesso alla porta account, e nessuna query prima del completamento del preflight. Non introdurre un flag pubblico `skipValidation` e non rimuovere il controllo dal motore neutro, che è utilizzabile direttamente.

### R6 — Estrarre i due casi comuni dei readmodel writer SQL — A

**Evidenza:** [attribute-registry knownCases](../packages/go-runbook/src/inventory/interop/k8s/k8s-interop-be-attribute-registry-readmodel-writer-sql-errors/knownCases.ts) e [catalog knownCases](../packages/go-runbook/src/inventory/interop/k8s/k8s-interop-be-catalog-readmodel-writer-sql-errors/knownCases.ts): stessi pattern di errore rete e rejoin Kafka, stessa restrizione a prod, stessi dettagli e direttive di analisi. jscpd rileva blocchi di 29 e 27 righe.

**Proposta:** factory di questi specifici casi che riceva l'alarm e gli id/descrizioni distintivi. Continuare a usare `knownCase` come costruttore comune. Non sostituire direttamente con `interopK8sKnownCase`: quest'ultimo cerca sia nei log applicativi sia nel CID tracker, mentre questi casi cercano soltanto nello step applicativo e impongono prod.

**Beneficio:** 30–55 righe nette stimate sui due file, con maggior valore se altri sibling risultano esattamente equivalenti. **Verifica:** id, priorità, regex, condizione, ordine dei dettagli, ticket PIN-7325, metadati e baseline devono rimanere identici. Condividere le definizioni non deve introdurre oggetti mutabili condivisi tra esecuzioni.

### R7 — Rimuovere il boilerplate ripetuto nei casi SelfcarePA — A

**Evidenza:** [knownCases SelfcarePA](../packages/go-runbook/src/inventory/send/downstream/pn-external-registries-SelfcarePA-downstream-detection-Alarm/knownCases.ts), tre casi con medesimi dettagli, livello, downstream e stato di analisi. Le differenze utili sono id, descrizione, priorità, pattern e risoluzione.

**Proposta:** una factory privata nel file o costanti locali per le righe dei dettagli e i default. Conservare l'attesa del trace lookup (`exists` sul conteggio), anche se il nome suggerisce che basterebbe il solo match sull'errore.

**Beneficio:** 20–40 righe nette stimate. Applicare lo stesso metodo a INAD/InfoCamere solo dopo confronto dei singoli casi: testo e condizioni sono dati operativi, non duplicazione da eliminare indiscriminatamente.

### R8 — Riutilizzare `knownCase` nell'helper INTEROP esistente — B

**Evidenza:** [interopK8sKnownCase](../packages/go-runbook/src/toolkits/interop/families/k8s/knownCases/interopK8sKnownCase.ts) assembla manualmente `KnownCase`, l'azione log e l'annotazione della risoluzione, responsabilità già raccolte in [knownCase](../packages/go-runbook/src/toolkits/common/analysis/knownCase.ts).

**Proposta:** costruire l'attuale condizione specifica INTEROP e delegare il resto a `knownCase`. È una riduzione di implementazione, non la sostituzione delle condizioni di tutti i runbook con la stessa condizione.

**Beneficio:** ordine di grandezza 15–30 righe; una sola implementazione del passaggio della risoluzione a console e analisi. **Rischio:** l'ordine di inserimento delle proprietà può cambiare il fingerprint RTA pur mantenendo uguale il JSON canonico. Verificare esplicitamente entrambe le baseline prima di adottare la delega.

### R9 — Ridurre gli export superflui, preservando le API necessarie — B

**Evidenza:** Knip segnala 11 export di valori e 19 di tipi. La verifica dei riferimenti corregge la prima interpretazione del risultato:

| Simboli                                                                                                              | Riscontro                                                                                                                | Azione proposta                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `API_GW_QUERY_COUNTER_VAR`, `API_GW_VISIT_COUNTER_VAR`, `API_GW_LAST_SERVICE_VAR`, `updateApiGwServicesVisitedChain` | Usati dentro `ApiGwAnalysisState.ts`, non eliminabili come implementazione.                                              | Valutare rimozione del solo `export` e dei re-export pubblici.                                         |
| `ApiGwQueryIdentifierMode`                                                                                           | Usato nello stesso modulo come tipo di `ApiGwCurrentQueryIdentifier`.                                                    | Eventualmente renderlo privato al modulo.                                                              |
| `addLogEntry`, `mergeChildContext`                                                                                   | Nessun consumatore TypeScript individuato nel monorepo oltre ai barrel.                                                  | Candidati a deprecazione/eliminazione; circa 45 righe complessive di implementazione e documentazione. |
| `noRunbookCheck`, `DEFAULT_TIME_WINDOW_MINUTES`                                                                      | Nessun consumatore individuato oltre alla superficie esportata.                                                          | Valutare API esterna prima di rimuovere.                                                               |
| `notifyAction`, `escalateAction`, `compositeAction`                                                                  | Factory senza consumatori individuati; le azioni corrispondenti sono supportate e testate anche tramite oggetti diretti. | Tenere le azioni; valutare separatamente se mantenere la comodità delle factory.                       |
| Tipi delle union `Condition`, `CaseAction`, `RunbookOutcome` e output API Gateway                                    | Molti sono usati come costituenti delle union nello stesso file.                                                         | Nessuna eliminazione meccanica dei tipi. Eventuale riduzione dei soli export.                          |
| `KnownUrlInLogs`, `ApiGwAuthorizerFailureOutcome`                                                                    | Tipi segnalati da Knip.                                                                                                  | Verifica dei contratti esposti e generati prima di renderli interni.                                   |

La pubblicazione su GitHub Packages significa che la ricerca nel monorepo non prova l'assenza di consumatori esterni. Il vantaggio di R9 è soprattutto una superficie più piccola; il codice realmente eliminabile è molto meno dei 30 simboli segnalati.

### R10 — Unificare i resolver di riferimento del controllo switch — B

**Evidenza:** [SwitchBranchStep](../packages/go-runbook/src/engine/steps/control/SwitchBranchStep.ts) mantiene un proprio `resolveRef`, mentre il motore dispone già del [resolver comune](../packages/go-runbook/src/engine/context/resolveRef.ts).

**Proposta:** riusare la risoluzione condivisa con un controllo esplicito dei prefissi supportati se si vuole mantenere l'attuale contratto. Il metodo privato attuale risolve soltanto `vars.*` e `params.*`; quello comune risolve anche gli output degli step. Una sostituzione senza filtro amplierebbe il comportamento.

**Beneficio:** circa 15–25 righe nette e una sola implementazione della lettura delle mappe. Preservare nomi contenenti punti, riferimento malformato e distinzione tra stringa vuota e riferimento non risolto.

### R11 — Evitare di copiare `stepResults` quando non cambia — B/C

**Evidenza:** [updateContextWithStepResult](../packages/go-runbook/src/engine/context/RunbookContextHelper.ts) crea sempre `new Map(context.stepResults)`, anche se `result.output` è `undefined` e nessuna voce viene aggiunta. Per `vars` il codice evita già la copia quando non ci sono variabili.

**Proposta:** applicare lo stesso criterio alla mappa degli output. Preservare l'immutabilità quando un output viene scritto; non mutare la mappa del contesto precedente.

**Beneficio:** evita copie O(S) sugli step senza output. La copia cumulativa con molti step dotati di output resta potenzialmente quadratica: questa modifica non la elimina. **Costo:** risparmio di righe nullo o leggermente negativo. Verificare i contratti di identità delle mappe, eventuali cast mutabili e il comportamento quando uno step già eseguito ritorna senza output: oggi il vecchio valore rimane, e deve rimanere anche dopo.

### R12 — Riutilizzare il motore tra occorrenze quando il logger è lo stesso — C

**Evidenza:** [executeRunbookForOccurrence](../packages/go-runbook/src/runtime/execution/executeRunbookForOccurrence.ts) crea ogni volta `OperationalRunbookEngine`, che ricrea `RunbookEngine`, `ActionExecutor` e `GORegexCache`. Il commento descrive un riuso del motore non presente nell'implementazione.

**Proposta:** consentire alla composition root di possedere il motore per un insieme di occorrenze con lo stesso logger. Conservare contesto, trace, servizi e active operations per esecuzione. Non introdurre una cache globale indicizzata da logger o account.

**Beneficio:** riuso delle regex compilate e meno allocazioni, da misurare sui workload ripetuti; nessuna promessa di miglioramento del tempo complessivo, dominato anche dalle query AWS. Non è una prima scelta se la nuova API di injection aumenta il codice più di quanto semplifichi il chiamante.

### R13 — Ridurre il costo del campione dei log senza complicarlo — C

**Evidenza:** [extractRecentLogLines](../packages/go-runbook/src/toolkits/common/parsing/aws/cloudwatch-logs/resultRows.ts) converte tutte le righe, ordina tutto e conserva gli ultimi K elementi. `Date.parse` viene richiamato nel comparatore. I builder usano normalmente K=5.

**Primo intervento:** calcolare una volta il timestamp numerico per riga, mantenendo la semantica dell'ordinamento stabile e il valore zero per timestamp non validi. **Intervento successivo solo con benchmark:** selezione top-K con memoria O(K), invece dell'ordinamento O(N log N).

La seconda soluzione può aumentare il codice e non è automaticamente preferibile. Non basta usare `slice(-K)` sui risultati AWS: l'ordinamento delle query non è uniformemente garantito da questo contratto. Verificare timestamp uguali/invalidi, righe senza messaggio e comportamento dei limiti prima di cambiare l'algoritmo.

### R14 — Migrare le viste di compatibilità del registry, poi rimuoverle — B, intervento trasversale

**Evidenza:** [runbookRegistry](../packages/go-runbook/src/inventory/registry/runbookRegistry.ts) mantiene sia `RUNBOOK_CATALOG` sia `RUNBOOK_REGISTRY`. La seconda mappa è ancora utilizzata da `go-analyze-alarm`, `go-rta-check`, `go-watchtower-runbook` e dalle baseline.

**Proposta:** migrare prima lookup, controllo di presenza ed elenco degli allarmi ai metodi del catalogo, aggiungendo soltanto i metodi mancanti. Poi valutare deprecazione della mappa e del wrapper `validateCloudRunbookRegistry`.

**Beneficio:** un solo modello di indicizzazione e meno API di compatibilità nel medio periodo. Nel breve il risparmio può essere negativo. Non sostituire per comodità ogni `.has()` con `listDescriptors()`: quest'ultimo costruisce tutti i runbook e annulla il vantaggio della risoluzione lazy. Non equiparare automaticamente `definitionDigest` al fingerprint RTA, che usa una serializzazione diversa.

### R15 — Ridurre i costruttori ripetitivi solo se si conserva la serializzazione — B/C

**Evidenza:** step come [QueryApiGwExecutionLogsStep](../packages/go-runbook/src/toolkits/common/families/apigw/steps/QueryApiGwExecutionLogsStep.ts) dichiarano numerosi campi privati e li assegnano uno per uno dal config. È boilerplate riducibile con un config normalizzato conservato nella classe.

**Valutazione:** candidato reale ma non prioritario. Passare da campi piatti a `this.config` cambia l'oggetto serializzato, i digest e le fingerprint. Anche mantenere il riferimento al config invece di copiarne i valori può cambiare il comportamento se il chiamante lo modifica dopo il costruttore.

Applicarlo soltanto dove si può conservare una rappresentazione stabile o dove si accetta esplicitamente una migrazione. Non aggiungere un serializzatore speciale per ogni step: rischierebbe di sostituire codice semplice con più codice e più convenzioni.

### R16 — Aggiornare commenti e documentazione rimasti alla fase precedente — A

**Evidenza:** il [README](../packages/go-runbook/README.md) indica ancora `src/catalog/runbooks/`; [engine/index.ts](../packages/go-runbook/src/engine/index.ts) descrive una fase F1 non più attuale e sostiene che il barrel non è ancora raggiungibile dagli entrypoint; il commento della shared instance di `ConditionEvaluator` la chiama frozen, mentre non viene congelata.

**Proposta:** descrivere la struttura finale, rimuovere la narrazione delle fasi dai commenti operativi e correggere l'indicazione sul motore riusato in R12. Non serve aggiungere `Object.freeze` solo per rendere vero un commento.

**Beneficio:** documentazione più breve e minore rischio di ricreare astrazioni che esistono già nella nuova organizzazione.

## Comportamenti di correttezza da trattare separatamente

Questi riscontri sono stati riprodotti con chiamate locali ai componenti reali. Non sono stati corretti perché richiedono una decisione sul contratto e non rappresentano semplici riduzioni di codice.

### C1 — L'azione update può mascherare il fallimento dello step

In [ActionExecutor](../packages/go-runbook/src/engine/actions/ActionExecutor.ts), il ramo `update` attende `action.step.execute(context)` ma ne ignora il risultato. Uno step che restituisce `{ success: false, error: 'write failed' }` senza lanciare un'eccezione produce un `ActionExecutionResult.status === 'success'`. La riproduzione restituisce proprio `success`.

Inoltre il motore registra l'esito dell'azione nella trace ma non trasforma automaticamente un'azione fallita in `RunbookExecutionResult.status === 'failed'`. Definire separatamente la semantica del fallimento dell'azione, soprattutto per le procedure mutative; non cambiare lo stato del runbook incidentalmente durante R4/R5.

### C2 — La sub-pipeline gestisce soltanto la direttiva stop

[executeSubPipeline](../packages/go-runbook/src/engine/steps/control/executeSubPipeline.ts) si ferma su errore o `next: 'stop'`, ma non gestisce `resolve` e `goTo`. La riproduzione con uno step che ritorna `next: 'resolve'` conferma che lo step successivo viene eseguito.

Il tipo `StepResult` permette queste direttive anche negli step annidati. Occorre decidere se vietarle esplicitamente in questo contesto oppure implementarne una semantica documentata. Condividere a forza il loop con il motore principale, prima di questa decisione, rischia di alterare isolamento degli output, trace e gestione dei salti.

## Aree analizzate che conviene conservare

| Area                            | Valutazione e limite della riduzione                                                                                                                                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Builder e validazione del grafo | Conservare controllo dei target e dei riferimenti ai known case; il numero di righe non giustifica eliminare validazioni. Un protocollo generico per descrivere tutti gli archi è più invasivo dei benefici attualmente dimostrati.                              |
| Anti-loop e abort               | `buildStepIndex` risolve salti in O(1); il detector dei cicli ha una scansione limitata. Conservare questi percorsi e la cancellazione cooperativa.                                                                                                              |
| Tracing                         | I dettagli del match e i limiti ai campioni sono informazione operativa. La modalità booleana e quella dettagliata hanno esigenze diverse: non imporre short-circuit alla trace completa.                                                                        |
| Step AWS e HTTP                 | I wrapper hanno metadati, capability e politica cloud diverse. Somiglianze nei costruttori e negli import non giustificano un'unica classe universale. Preservare le differenze tra errori convertiti in risultato e abort rilanciati.                           |
| Parsing e query                 | Esistono già `renderQueryTemplate`, lettura delle righe, schemi dei log e selezione dell'errore rappresentativo. Riusarli, evitando nuovi parser paralleli. Conservare escape, proiezioni, limiti e numero di query.                                             |
| Toolkit SEND                    | Il traversal dei servizi distingue trace, fallback e visite: mantenerlo esplicito. Non eliminare stato o contatori solo perché un export risulta inutilizzato fuori dal modulo.                                                                                  |
| Toolkit INTEROP                 | Le factory `defineInteropK8sAlarm` e i builder di famiglia esistono già. R6–R8 devono completarne il riuso, senza introdurre un secondo sistema di descrizione.                                                                                                  |
| Account e runtime               | La separazione directory/runtime mantiene il motore indipendente dalle credenziali. Conservare binding per occorrenza, region/account esatti, assenza di fallback e scrubbing degli errori.                                                                      |
| Catalogo                        | La costruzione lazy è già presente. La seconda costruzione in `validateForCloud` verifica stabilità del descrittore: non è semplice spreco eliminabile.                                                                                                          |
| Analisi Watchtower              | `buildPotentialAnalysisDrafts` costruisce draft per i suffissi delle priorità: può richiedere lavoro quadratico nei casi/risorse, ma è validazione statica. Non eliminarla per ridurre le righe; ottimizzarla soltanto se si osserva un costo rilevante.         |
| Tipi e augmentations            | Le estensioni tengono il motore indipendente dai domini; evitare la loro fusione in un grande contesto AWS. Le union nominate facilitano i contratti anche se i tipi singoli non vengono importati direttamente.                                                 |
| Test                            | Quasi metà delle righe TypeScript appartiene ai test/helper. Le ripetizioni di fixture possono essere ridotte in seguito; conservare esempi leggibili e asserzioni sugli esiti. Ridurre i test per migliorare il conteggio delle righe non soddisfa l'obiettivo. |

## Compatibilità e criteri di accettazione

Le baseline in `src/__baseline__` coprono descrittori, JSON canonico delle definizioni, fingerprint ed export pubblici, inclusi membri delle classi. Sono state controllate dai test eseguiti.

Le due serializzazioni non sono intercambiabili:

- `RunbookCatalog` calcola `definitionDigest` dal JSON canonico.
- `go-watchtower-runbook` e la baseline delle fingerprint usano `safeJsonStringify`, sensibile anche all'ordine dei campi; il codice delle funzioni non è parte dell'hash strutturale.

Di conseguenza, modificare l'implementazione può richiedere una valutazione della cache anche quando l'hash strutturale non cambia. Spostare le proprietà in un config può invece cambiare l'hash senza cambiare il comportamento eseguito. La gestione delle versioni/cache deve essere esplicita.

Per ogni intervento:

1. Misurare il saldo reale di righe e moduli, compresi i nuovi helper.
2. Mantenere API e baseline byte-identiche quando l'intervento è dichiarato compatibile. Non rigenerare le baseline per far passare il test senza spiegare il cambiamento.
3. Verificare i test mirati di condizioni, output, account, azioni e runbook coinvolti, poi la suite del package.
4. Verificare i consumatori interessati quando cambiano entrypoint, registry o contratti runtime.
5. Confrontare query prodotte, numero di chiamate AWS, ordinamento dei casi, priorità, direttive di flusso e payload finali. La sola build non verifica questi aspetti.
6. Per R11–R13 misurare tempo e allocazioni con dati rappresentativi prima di dichiarare benefici prestazionali.

## Sequenza consigliata

**Prima tranche:** R1, R2, R3, R4, R6, R7 e R16. Interventi piccoli, confrontabili e con benefici locali. Le stime suggeriscono una riduzione di qualche centinaio di righe sulle porzioni esaminate, non migliaia di righe dimostrate. Il dato da accettare sarà il diff netto dopo ogni intervento.

**Seconda tranche:** R5, R8 e R10, con confronto delle baseline e dell'ordine dei controlli. R9 solo dopo aver classificato gli export per compatibilità, senza confondere uso interno e uso esterno.

**Tranche condizionata ai risultati:** R11–R13 per le prestazioni; R14 e R15 soltanto come migrazioni motivate. C1 e C2 meritano interventi distinti con test di regressione e comportamento atteso esplicito.

## Riproducibilità dell'analisi

```bash
pnpm --filter @pagopa/go-runbook build
pnpm --filter @pagopa/go-runbook test
pnpm exec knip --workspace @pagopa/go-runbook \
  --include files,exports,types,dependencies,duplicates \
  --include-entry-exports --reporter json
```

Per jscpd è stata usata una configurazione temporanea con `path` assoluto a `packages/go-runbook/src`, formato `typescript`, `minTokens: 70`, `gitignore: true`, esclusioni `**/__tests__/**` e `**/__baseline__/**`, reporter JSON. Il path assoluto evita che il tool risolva il sorgente relativamente alla directory della configurazione temporanea.

I log e i report grezzi della sessione sono in `/tmp/go-runbook-audit-tests.log`, `/tmp/go-runbook-audit-build.log`, `/tmp/go-runbook-audit-knip.json` e `/tmp/go-runbook-audit-duplicates/jscpd-report.json`. Sono artefatti temporanei; i risultati e i limiti rilevanti sono riportati in questo documento.
