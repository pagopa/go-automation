# Runbook Engine - Reference

> **Documentazione di riferimento per il motore di esecuzione runbook**
> Package: `@pagopa/go-runbook`. L'engine descritto qui è l'entrypoint `.`; i toolkit operativi sono in `./toolkits/*`, i runbook in `./inventory`, la composizione in `./runtime` (struttura completa in §13).

Per il contratto delle evidenze custom e dei campi diagnostici, vedere
[Output delle diagnostiche dei runbook](architecture/runbook-evidence.md).

---

## 1. Panoramica

Il Runbook Engine è un sistema per definire, comporre ed eseguire runbook operativi. Un runbook è una procedura strutturata che:

1. Raccoglie dati da diverse sorgenti (CloudWatch, Athena, DynamoDB, HTTP)
2. Esegue una sequenza di step autonomi, ognuno con input/output tipizzati
3. Alla fine della pipeline confronta il risultato con **tutti** i **casi noti**, in ordine di dichiarazione
4. Riporta **ogni** caso che corrisponde (una **rilevazione**), ordinato per il tempo della prima evidenza
5. Esegue l'**azione associata** a ciascun caso rilevato, nello stesso ordine (o il fallback, se nessuno corrisponde)
6. Dichiara la **copertura** dell'evidenza: cosa il runbook non ha potuto vedere
7. Con un **albero degli errori**, indaga ogni errore della finestra come un nodo, livello per livello (§19)

### Rilevazioni, tempo e copertura

Un allarme può nascondere più errori diversi nella stessa finestra. Il motore non sceglie un "caso vincente": esegue
tutta la pipeline, valuta ogni caso noto sul contesto finale e restituisce tutte le rilevazioni.

- **Nessuna risoluzione anticipata.** Uno step non può fermare la pipeline perché "ha trovato qualcosa": le direttive
  sono solo `continue` e `stop` (§2.4). Anche dopo `stop` i casi noti vengono valutati.
- **Ordine di tempo.** Ogni rilevazione porta il primo e l'ultimo istante dell'evidenza che la prova
  (`firstSeenAt`/`lastSeenAt`), letti con `RunbookEngineOptions.evidenceTime` (§5.3). A pari tempo vale l'ordine di
  dichiarazione; le rilevazioni senza tempo vanno in fondo.
- **Casi che si sostituiscono.** Quando due casi descrivono lo stesso errore, quello più preciso dichiara
  `supersedes` con gli id dei casi che sostituisce (§2.6): se corrispondono entrambi, resta solo il più preciso.
- **Copertura.** Uno step che non ha visto tutta l'evidenza (query satura, lettura fallita o saltata, correlazione
  manuale) lo dichiara in `StepResult.coverage` (§2.3). Se uno step fallisce dopo che un'altra lettura è riuscita,
  l'esecuzione resta `completed` con l'evidenza raccolta e il fallimento diventa una fonte `unavailable` (§5.2).
- **Ogni errore, non uno rappresentativo.** Un runbook con albero degli errori (§19) segue ogni errore della finestra
  nei livelli sotto, ciascuno nel suo contesto, e riporta una catena per errore, raggruppata con quelle uguali.

### Tipologie di Runbook

| Tipo                  | Descrizione                               | Step tipici                                                     |
| --------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| **Alarm Resolution**  | Indagine e risoluzione allarmi CloudWatch | Query CW Logs -> Estrazione errore -> Match caso noto -> Azione |
| **Data Verification** | Verifica consistenza dati                 | Query DynamoDB -> Confronto -> Report                           |
| **Data Update**       | Aggiornamento dati operativi              | Query -> Validazione -> Update DynamoDB                         |
| **Health Check**      | Verifica stato servizi                    | HTTP GET -> Check response -> Report                            |

---

## 2. Concetti Fondamentali

### 2.1 Step

Uno **Step** è l'unità atomica di esecuzione. Riceve un contesto immutabile e produce un risultato.

```typescript
/**
 * Interfaccia base per tutti gli step del runbook.
 * Ogni step è un componente autonomo: riceve un contesto, produce un risultato.
 *
 * @typeParam TOutput - Il tipo dell'output prodotto dallo step
 */
interface Step<TOutput = unknown> {
  /** Identificativo univoco dello step all'interno del runbook */
  readonly id: string;
  /** Etichetta leggibile per log e UI */
  readonly label: string;
  /** Categoria dello step (per logging e filtraggio) */
  readonly kind: StepKind;
  /** Esegue lo step e restituisce il risultato */
  execute(context: RunbookContext): Promise<StepResult<TOutput>>;
  /**
   * Restituisce informazioni di trace specifiche dello step per debugging e audit.
   * Chiamato dal motore prima di execute() per catturare la configurazione risolta
   * (query interpolate, URL, espressioni, etc.) nel trace di esecuzione.
   *
   * Opzionale: gli step senza informazioni di trace significative possono ometterlo.
   */
  getTraceInfo?(context: RunbookContext): Readonly<Record<string, unknown>>;
}
```

### 2.2 StepDescriptor

Un wrapper che associa a uno step opzioni di esecuzione aggiuntive come `continueOnFailure`.

```typescript
/**
 * Descrittore di uno step con opzioni di esecuzione.
 * Wrappa uno Step aggiungendo configurazione runtime.
 */
interface StepDescriptor<TOutput = unknown> {
  /** Lo step da eseguire */
  readonly step: Step<TOutput>;
  /** Se true, un fallimento dello step non interrompe l'esecuzione */
  readonly continueOnFailure?: boolean;
}
```

### 2.3 StepResult

Il risultato di ogni step contiene l'output e le istruzioni per il flusso di esecuzione.

```typescript
/**
 * Risultato dell'esecuzione di uno step.
 * Incapsula l'output, lo stato di successo e le direttive di controllo del flusso.
 */
interface StepResult<TOutput = unknown> {
  /** Se lo step è stato eseguito con successo */
  readonly success: boolean;
  /** Output prodotto dallo step (undefined se success=false) */
  readonly output?: TOutput;
  /** Messaggio di errore (solo se success=false) */
  readonly error?: string;
  /** Variabili da aggiungere/aggiornare nel contesto */
  readonly vars?: Readonly<Record<string, string>>;
  /** Diagnostiche non funzionali, solo nella traccia */
  readonly diagnostics?: StepDiagnostics;
  /** Direttiva di flusso: quale step eseguire dopo */
  readonly next?: FlowDirective;
  /** Evidenza parziale dichiarata dallo step, una voce per fonte; assente = completa */
  readonly coverage?: ReadonlyArray<StepCoverage>;
  /** Errori osservati ed esaminati, da uno step che enumera gli errori della finestra */
  readonly observedErrors?: ObservedErrors;
  /** Discese chieste da uno step di un nodo dell'albero degli errori (§19.3) */
  readonly descend?: ReadonlyArray<DescendRequest>;
}

/**
 * Cosa dichiara uno step quando non ha visto tutta l'evidenza che avrebbe dovuto vedere.
 */
interface StepCoverage {
  /** Etichetta sicura della fonte (account logico, log group, lotto); mai un nome di profilo AWS */
  readonly source?: string;
  /** false quando l'evidenza di questa fonte è parziale */
  readonly complete: boolean;
  /**
   * - 'saturated': righe pari al limite della query, o pagine non lette
   * - 'unavailable': la fonte non si è potuta leggere
   * - 'skipped': la lettura non è stata tentata, o degli elementi sono stati scartati
   * - 'manual': la correlazione non è automatica
   */
  readonly reason?: 'saturated' | 'unavailable' | 'skipped' | 'manual';
  /** Al massimo 200 caratteri, ripuliti dai nomi dei profili; mai nella bozza d'analisi */
  readonly detail?: string;
  /** Gli identificativi a cui la lacuna si limita; assenti o vuoti = tutta la lettura (§18.6) */
  readonly identifiers?: ReadonlyArray<EvidenceIdentifier>;
}

/**
 * Quanti errori uno step ha osservato e quanti il runbook ne ha esaminati.
 * Un runbook che segue un solo errore rappresentativo (l'invocazione Lambda) dichiara gli
 * altri come osservati e non esaminati. Un runbook con albero degli errori li esamina tutti.
 */
interface ObservedErrors {
  readonly unit: 'request' | 'invocation' | 'errorRow';
  /** Errori distinti osservati; un limite inferiore se lowerBound */
  readonly observed: number;
  /** true quando l'enumerazione è incompleta (satura, non disponibile, pagine non lette) */
  readonly lowerBound?: boolean;
  /** Errori effettivamente esaminati */
  readonly examined: number;
}

/**
 * Informazioni di recovery per step falliti con continueOnFailure attivo.
 */
interface ErrorRecoveryInfo {
  /** ID dello step che ha generato l'errore */
  readonly stepId: string;
  /** Messaggio di errore originale */
  readonly originalError: string;
  /** Timestamp del fallimento */
  readonly failedAt: Date;
}
```

### 2.4 FlowDirective

Le direttive di flusso controllano quale step eseguire dopo quello corrente.

```typescript
/**
 * Direttive di controllo del flusso di esecuzione.
 * - 'continue': procedi allo step successivo in sequenza
 * - 'stop': termina la pipeline; i casi noti vengono comunque valutati
 */
type FlowDirective = 'continue' | 'stop';
```

Non esiste una direttiva di risoluzione anticipata: il motore esegue sempre la pipeline fino in fondo (o fino a `stop`)
e solo dopo valuta i casi noti. `stop` serve a chiudere un percorso che non ha altro da leggere, per esempio il gate
dell'authorizer API Gateway, non a dichiarare un caso trovato. In un nodo dell'albero degli errori `stop` chiude gli step
del nodo, che quindi non scende (§19.2).

### 2.5 RunbookContext

Il contesto è lo stato immutabile condiviso tra tutti gli step. Viene aggiornato (tramite copia) dopo ogni step.

```typescript
/**
 * Contesto di esecuzione del runbook.
 * Immutabile: ogni step produce un nuovo contesto aggiornato.
 */
interface RunbookContext {
  /** ID univoco dell'esecuzione corrente */
  readonly executionId: string;
  /** Timestamp di inizio esecuzione */
  readonly startedAt: Date;
  /** Risultati indicizzati per stepId */
  readonly stepResults: ReadonlyMap<string, unknown>;
  /** Variabili estratte durante l'esecuzione (traceId, errorCode, etc.) */
  readonly vars: ReadonlyMap<string, string>;
  /** Parametri di input del runbook (alarmName, timeRange, etc.) */
  readonly params: ReadonlyMap<string, string>;
  /** Servizi AWS e HTTP iniettati */
  readonly services: ServiceRegistry;
  /**
   * Errori recuperati da step con continueOnFailure.
   * Permette di ispezionare quali step sono falliti senza bloccare l'esecuzione.
   */
  readonly recoveredErrors: ReadonlyArray<ErrorRecoveryInfo>;
  /** Segnale di abort per cancellare l'esecuzione. Propagato a tutte le chiamate ai servizi. */
  readonly signal?: AbortSignal;
  /**
   * Stato delle letture visto da questo contesto, in sola lettura: registra solo il motore (§18.6).
   * Un contesto costruito a mano usa EMPTY_RUNBOOK_READS, in cui ogni lettura è `queried`.
   */
  readonly reads: RunbookReads;
  /**
   * Letture della finestra che uno step fa una volta per tutta l'esecuzione, per chiave, condivise
   * da tutti i nodi dell'albero degli errori. Create da ogni esecuzione, mai condivise fra esecuzioni (§19.11).
   */
  readonly sharedReads?: Map<string, Promise<unknown>>;
}
```

### 2.6 KnownCase

Un caso noto è un pattern riconoscibile nel risultato finale, con un'azione associata.

```typescript
/**
 * Caso noto: un pattern che identifica una situazione specifica
 * e l'azione da intraprendere.
 */
interface KnownCase {
  /** Identificativo univoco del caso */
  readonly id: string;
  /** Descrizione leggibile del caso */
  readonly description: string;
  /** Condizione che deve essere verificata per matchare questo caso */
  readonly condition: Condition;
  /** Azione da eseguire quando il caso viene riconosciuto */
  readonly action: CaseAction;
  /**
   * Casi che questo sostituisce quando corrispondono entrambi: una spiegazione più precisa
   * dello stesso errore. I casi sostituiti escono dalle rilevazioni e restano nella traccia
   * con `supersededBy`.
   */
  readonly supersedes?: ReadonlyArray<string>;
}
```

Non c'è una priorità: i casi si valutano in ordine di dichiarazione e **tutti** quelli che corrispondono diventano
rilevazioni. L'ordine di dichiarazione decide solo a parità di tempo della prima evidenza.

`supersedes` serve quando due casi descrivono lo stesso errore a livelli di dettaglio diversi, per esempio un caso
generico "timeout verso il downstream" e uno specifico "timeout verso PDV". Il caso specifico dichiara
`supersedes: ['downstream-timeout']`; se corrispondono entrambi, resta solo quello specifico. Il builder rifiuta un id
che non è un caso del runbook (`UNKNOWN_SUPERSEDED_CASE`) e i cicli, compreso un caso che sostituisce se stesso
(`SUPERSEDES_CYCLE`).

### 2.7 Runbook

La definizione completa di un runbook.

```typescript
/**
 * Definizione completa di un runbook.
 * Contiene metadati, step da eseguire e casi noti per la risoluzione.
 */
interface Runbook {
  /** Metadati del runbook */
  readonly metadata: RunbookMetadata;
  /** Step da eseguire in sequenza (salvo direttive di flusso) */
  readonly steps: readonly StepDescriptor[];
  /** Casi noti da verificare al termine dell'esecuzione, in ordine di dichiarazione */
  readonly knownCases: readonly KnownCase[];
  /** Azione da eseguire se nessun caso noto corrisponde */
  readonly fallbackAction: CaseAction;
  /** Limite massimo di iterazioni per la protezione anti-loop */
  readonly maxIterations?: number;
  /** Albero degli errori, indagato dopo gli step della finestra (§19); assente per un runbook di finestra */
  readonly tree?: ErrorTreeDefinition;
  /** Come il runbook legge l'evidenza; assente significa `strict` */
  readonly readPolicy?: ReadPolicy;
}

type ReadPolicy = 'partial' | 'strict';

interface RunbookMetadata {
  /** Identificativo univoco del runbook */
  readonly id: string;
  /** Nome leggibile */
  readonly name: string;
  /** Descrizione */
  readonly description: string;
  /** Versione */
  readonly version: string;
  /** Tipo di runbook */
  readonly type: RunbookType;
  /** Team proprietario */
  readonly team: string;
  /** Tag per categorizzazione */
  readonly tags: readonly string[];
}

type RunbookType = 'alarm-resolution' | 'data-verification' | 'data-update' | 'health-check';
```

La **politica di lettura** la dichiara il runbook (`RunbookBuilder.readPolicy(...)`), mai il motore dal tipo. Con
`partial` una lettura tiene quanto ha letto quando una parte fallisce, e uno step che fallisce dopo aver raccolto
evidenza ferma la pipeline lasciando l'esecuzione completata sull'evidenza parziale; con `strict` (il default, per
le procedure) la lettura fallisce per intero e lo step fallito fa fallire l'esecuzione. `AlarmRunbookBuilder` dei
toolkit imposta `partial`.

---

## 3. Catalogo Step

Gli step sono organizzati per categoria. Ogni categoria ha una responsabilità specifica.

### 3.1 Data Steps (Recupero dati)

```
StepKind: 'data'
```

Questi step raccolgono dati grezzi. Tipicamente restituiscono `'continue'` perché non analizzano i dati.

| Step                      | Input (da context)          | Output                     | Descrizione                   |
| ------------------------- | --------------------------- | -------------------------- | ----------------------------- |
| `CloudWatchLogsQueryStep` | logGroups, query, timeRange | `readonly ResultField[][]` | Esegue query CW Logs Insights |

### 3.2 Control Flow Steps (Controllo flusso)

```
StepKind: 'control'
```

| Step         | Input                     | Output | Descrizione                        |
| ------------ | ------------------------- | ------ | ---------------------------------- |
| `SetVarStep` | varName, value/expression | `void` | Imposta una variabile nel contesto |

---

## 4. Sistema di Condizioni

Le condizioni sono composibili e vengono usate sia negli step di controllo flusso che nel matching dei casi noti.

```typescript
/**
 * Condizione valutabile sul contesto del runbook.
 * Le condizioni sono composibili tramite operatori logici.
 */
type Condition = CompareCondition | PatternCondition | ExistsCondition | AndCondition | OrCondition | NotCondition;

/** Confronto tra un valore dal contesto e un valore atteso */
interface CompareCondition {
  readonly type: 'compare';
  /** Riferimento al valore nel contesto: 'vars.errorCode', 'steps.step1.output', etc. */
  readonly ref: string;
  readonly operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  readonly value: string | number | boolean;
}

/** Verifica che un valore corrisponda a un pattern regex */
interface PatternCondition {
  readonly type: 'pattern';
  readonly ref: string;
  readonly regex: string;
}

/** Verifica che un valore esista (non undefined, non null, non stringa vuota) */
interface ExistsCondition {
  readonly type: 'exists';
  readonly ref: string;
}

/** AND logico tra condizioni */
interface AndCondition {
  readonly type: 'and';
  readonly conditions: readonly Condition[];
}

/** OR logico tra condizioni */
interface OrCondition {
  readonly type: 'or';
  readonly conditions: readonly Condition[];
}

/** NOT logico */
interface NotCondition {
  readonly type: 'not';
  readonly condition: Condition;
}
```

### ConditionEvaluator

```typescript
/**
 * Valuta condizioni sul contesto del runbook.
 * Supporta riferimenti a variabili, risultati di step e parametri.
 *
 * Formato riferimenti (ref):
 * - 'vars.{name}'          -> variabile dal contesto
 * - 'steps.{stepId}.output' -> output di uno step precedente
 * - 'params.{name}'        -> parametro di input del runbook
 */
class ConditionEvaluator {
  evaluate(condition: Condition, context: RunbookContext): boolean;
  evaluate(
    condition: Condition,
    context: RunbookContext,
    options: { readonly withResolvedValues: true },
  ): {
    readonly matched: boolean;
    readonly resolvedValues: Readonly<Record<string, unknown>>;
    /** Per ogni ref di tipo array, gli indici degli elementi che hanno soddisfatto un predicato */
    readonly evidence: ReadonlyMap<string, ReadonlySet<number>>;
  };
}
```

Con `withResolvedValues` il valutatore restituisce anche l'**evidenza** del match: gli indici delle righe che hanno
soddisfatto un predicato, raccolti **solo dai rami soddisfatti**. Un `and` contribuisce con tutti i suoi rami, un `or`
solo con quelli veri, un `not` con nessuno (una negazione prova un'assenza, non una riga). Se la condizione non è
soddisfatta, o legge solo scalari, l'evidenza è vuota. Il motore usa questi indici per leggere il tempo e il peso della
rilevazione (§5.3).

---

## 5. Motore di Esecuzione

### 5.1 RunbookEngine

```typescript
/**
 * Limite predefinito di iterazioni per la protezione anti-loop.
 */
const DEFAULT_MAX_ITERATIONS = 1000;

/**
 * Errore lanciato quando il numero massimo di iterazioni viene superato.
 */
class RunbookMaxIterationsError extends Error {
  constructor(
    readonly runbookId: string,
    readonly maxIterations: number,
    readonly lastStepId: string,
    readonly visitedSequence: readonly string[],
  ) {
    super(
      `Runbook "${runbookId}" ha superato il limite di ${maxIterations} iterazioni. ` +
        `Ultimo step: "${lastStepId}". Possibile loop infinito rilevato. ` +
        `Ultimi step visitati: [${visitedSequence.slice(-10).join(' -> ')}]`,
    );
    this.name = 'RunbookMaxIterationsError';
  }
}

/**
 * Collaboratori iniettati nel motore.
 */
interface RunbookEngineOptions {
  /** Predicati di capacità dei servizi che gli step dichiarano come richiesti */
  readonly serviceCapabilities?: ServiceCapabilityCheck;
  /** Renderer delle azioni di log; il default del motore è testo semplice */
  readonly logActionRenderer?: LogActionRenderer;
  /** Lettore del tempo degli elementi di evidenza; senza, le rilevazioni non hanno tempo */
  readonly evidenceTime?: EvidenceTimeReaderFn;
}

/**
 * Motore di esecuzione dei runbook.
 * Orchestrazione: esegue step in sequenza, gestisce il flusso,
 * e alla fine rileva tutti i casi noti.
 *
 * Funzionalità principali:
 * - Protezione anti-loop con maxIterations
 * - Supporto continueOnFailure per step resilienti
 * - Ogni caso noto che corrisponde riportato come rilevazione, ordinata per tempo dell'evidenza
 * - Evidenza parziale (copertura) dichiarata dagli step, conservata anche se uno step successivo fallisce
 */
class RunbookEngine {
  constructor(
    private readonly logger: GOLogger,
    private readonly options: RunbookEngineOptions = {},
  ) {}

  /**
   * Esegue un runbook completo.
   *
   * Flusso:
   * 1. Inizializza il contesto con i parametri di input
   * 2. Esegue gli step in sequenza, finché uno step non ferma la pipeline
   * 3. Valuta tutti i casi noti, in ordine di dichiarazione
   * 4. Esegue l'azione di ogni rilevazione, nell'ordine delle rilevazioni (o la fallbackAction)
   * 5. Costruisce e restituisce il risultato con la traccia
   *
   * Uno step che fallisce dopo che è stata raccolta evidenza non fa fallire l'esecuzione:
   * la pipeline si ferma, la lettura fallita diventa una voce di copertura 'unavailable'
   * e i casi noti si valutano sul contesto raggiunto.
   *
   * @param runbook - Definizione del runbook da eseguire
   * @param params - Parametri di input (alarmName, timeRange, etc.)
   * @param services - Registry dei servizi AWS/HTTP
   * @param environment - Informazioni sull'ambiente di esecuzione (opzionale)
   * @param signal - Segnale di abort per cancellare l'esecuzione (opzionale)
   * @returns Risultato dell'esecuzione completa
   * @throws RunbookMaxIterationsError se viene superato il limite di iterazioni
   */
  async execute(
    runbook: Runbook,
    params: ReadonlyMap<string, string>,
    services: ServiceRegistry,
    environment?: ExecutionEnvironment,
    signal?: AbortSignal,
  ): Promise<RunbookExecutionResult> {
    const context = this.initContext(params, services);
    const maxIterations = runbook.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    // Copertura raccolta, evidenza già letta
    const state: ExecutionState = { coverage: [], evidenceCollected: false };

    const { context: finalContext, status } = await this.executeSteps(
      runbook.steps,
      context,
      maxIterations,
      runbook.metadata.id,
      state,
    );

    // Fase 2: rilevazione dei casi noti, solo per un'esecuzione completata
    const detections = status === 'completed' ? this.detectKnownCases(runbook.knownCases, finalContext) : [];

    // Fase 3: l'azione di ogni rilevazione, in ordine; il fallback solo se nessun caso corrisponde
    if (status === 'completed') {
      const actions = detections.length > 0 ? detections.map((d) => d.knownCase.action) : [runbook.fallbackAction];
      for (const action of actions) await this.executeAction(action, finalContext);
    }

    return this.buildResult(finalContext, status, detections, state.coverage, state.observedErrors);
  }
}
```

`OperationalRunbookEngine` (`@pagopa/go-runbook/toolkits/common`) passa al motore come `evidenceTime` il lettore
interno del toolkit (`readEvidenceTime`): legge il tempo dalle righe di CloudWatch Logs Insights (`@timestamp`, oppure `firstTimestamp` e
`latestTimestamp` di una riga aggregata), dagli oggetti con `supportingRows` o `rows` e dagli oggetti con `@timestamp`;
il peso è `count` per una riga aggregata e 1 altrimenti. Legge anche gli identificativi tipizzati (`trace_id`,
`requestId`, `cid`, …), che finiscono nelle `observations` della rilevazione. Un `RunbookEngine` costruito senza
`evidenceTime` produce rilevazioni senza tempo, ordinate per dichiarazione.

### 5.2 Algoritmo di Esecuzione Step (con protezione anti-loop, continueOnFailure ed evidenza parziale)

```typescript
/**
 * Esegue gli step in sequenza, finché uno step non ferma la pipeline.
 * Include protezione anti-loop e supporto continueOnFailure, e raccoglie l'evidenza:
 * la copertura dichiarata e gli errori osservati.
 *
 * Uno step con continueOnFailure che fallisce, sia lanciando un'eccezione sia restituendo
 * success=false, è recuperato: finisce in recoveredErrors e la pipeline prosegue.
 * Ogni altro step che fallisce chiude la pipeline. Se prima era già riuscita una lettura
 * (uno step `kind: 'data'`), l'evidenza è parziale: lo step diventa una voce di copertura
 * 'unavailable' e l'esecuzione resta completata. Altrimenti l'esecuzione fallisce.
 *
 * @param stepDescriptors - Step da eseguire con le relative opzioni
 * @param initialContext - Contesto iniziale
 * @param maxIterations - Numero massimo di iterazioni consentite
 * @param runbookId - ID del runbook (per messaggi di errore)
 * @param state - Stato dell'esecuzione: copertura, evidenza già raccolta
 * @returns Contesto finale e stato dell'esecuzione
 * @throws RunbookMaxIterationsError se viene superato il limite di iterazioni
 */
private async executeSteps(
  stepDescriptors: readonly StepDescriptor[],
  initialContext: RunbookContext,
  maxIterations: number,
  runbookId: string,
  state: ExecutionState,
): Promise<StepsOutcome> {
  let context = initialContext;

  let currentIndex = 0;
  let iterations = 0;
  const visitedSequence: string[] = [];

  while (currentIndex < stepDescriptors.length) {
    // Protezione anti-loop
    iterations++;
    if (iterations > maxIterations) {
      const lastStepId = visitedSequence[visitedSequence.length - 1] ?? 'unknown';
      throw new RunbookMaxIterationsError(runbookId, maxIterations, lastStepId, visitedSequence);
    }

    const descriptor = stepDescriptors[currentIndex];
    if (descriptor === undefined) break;

    const { step, continueOnFailure } = descriptor;
    visitedSequence.push(step.id);

    const evidenceBefore = state.evidenceCollected;
    // Un throw dello step diventa un risultato fallito (un annullamento invece si rilancia)
    const { context: nextContext, result } = await this.executeStepDescriptor(descriptor, context);
    context = nextContext;

    // Evidenza: le voci di copertura incomplete, gli errori osservati
    recordStepEvidence(state, step.id, result);
    if (result.success && step.kind === 'data') state.evidenceCollected = true;

    if (result.success === false) {
      state.coverage.push(failedReadCoverage(step.id, result.error)); // reason: 'unavailable'
      if (continueOnFailure === true) {
        // Recupero deciso qui, per l'eccezione come per il fallimento restituito
        context = addRecoveredError(context, { stepId: step.id, originalError: result.error, failedAt: new Date() });
        currentIndex++;
        continue;
      }
      if (evidenceBefore && runbook.readPolicy === 'partial') {
        // Lettura parziale: la pipeline si ferma, l'esecuzione resta completata
        this.logger.warning(`[${step.id}] Step failed after evidence was collected: the evidence is partial`);
        return { context, status: 'completed' };
      }
      return { context, status: 'failed', failureReason: result.error };
    }

    // Determina prossimo step
    const directive = result.next ?? 'continue';
    if (directive === 'stop') {
      break; // i casi noti vengono valutati comunque
    }
    currentIndex++;
  }

  return { context, status: 'completed' };
}
```

### 5.3 Rilevazione dei Casi Noti

```typescript
/**
 * Valuta ogni caso noto sul contesto finale e restituisce le rilevazioni.
 *
 * I casi si valutano in ordine di dichiarazione e si tengono tutti quelli che corrispondono.
 * Un caso elencato nel `supersedes` di un altro caso che corrisponde esce dalle rilevazioni
 * e resta nella traccia con `supersededBy`. Le rilevazioni sono ordinate per tempo
 * dell'evidenza: `firstSeenAt` crescente, ordine di dichiarazione a pari merito,
 * rilevazioni senza tempo in fondo.
 */
private detectKnownCases(
  knownCases: readonly KnownCase[],
  context: RunbookContext,
): ReadonlyArray<KnownCaseDetection> {
  const matches = new Map<string, CaseMatch>();
  for (const [declarationIndex, knownCase] of knownCases.entries()) {
    const { matched, evidence } = this.conditionEvaluator.evaluate(knownCase.condition, context, {
      withResolvedValues: true,
    });
    // readEvidence: tempo, peso e identificativi delle righe di evidenza, via options.evidenceTime
    if (matched) matches.set(knownCase.id, { knownCase, declarationIndex, ...this.readEvidence(evidence, context) });
  }

  const supersededBy = new Map<string, string>();
  for (const match of matches.values()) {
    for (const replaced of match.knownCase.supersedes ?? []) {
      if (matches.has(replaced) && !supersededBy.has(replaced)) supersededBy.set(replaced, match.knownCase.id);
    }
  }

  return [...matches.values()]
    .filter((match) => !supersededBy.has(match.knownCase.id))
    .sort(compareCaseMatches) // firstSeenAt, poi ordine di dichiarazione, senza tempo in fondo
    .map(toDetection);
}
```

Ogni rilevazione è un `KnownCaseDetection`:

```typescript
interface KnownCaseDetection {
  readonly knownCase: KnownCase;
  /** Prima evidenza che soddisfa il caso (ISO-8601 UTC); assente se l'evidenza non ha tempo */
  readonly firstSeenAt?: string;
  /** Ultima evidenza che soddisfa il caso (ISO-8601 UTC) */
  readonly lastSeenAt?: string;
  /** Righe di evidenza del caso; una riga aggregata conta il suo `count`. Mai un numero di errori */
  readonly evidenceRows: number;
  /** Identificativi tipizzati letti dall'evidenza, ciascuno con il suo tempo */
  readonly observations: ReadonlyArray<IdentifierObservation>;
}
```

Il tempo viene solo dalle righe che hanno davvero soddisfatto la condizione (l'evidenza del `ConditionEvaluator`,
§4): una riga presente nell'output ma esclusa da un ramo falso di un `or` non sposta `firstSeenAt`.

### 5.4 Flusso di Esecuzione del Motore

Il flusso di esecuzione del motore è il seguente:

```
Fase 1: Esecuzione Step
  per ogni step:
    esegui step -> ottieni StepResult
    aggiorna contesto, registra la copertura e gli errori osservati
    se lo step fallisce:
      registra una voce di copertura 'unavailable'
      se continueOnFailure: registra il recupero in recoveredErrors e prosegui
      altrimenti se una lettura (kind 'data') era già riuscita: BREAK, esecuzione 'completed'
      altrimenti: BREAK, esecuzione 'failed'
    altrimenti se next === 'stop':
      BREAK
    altrimenti:
      prosegui

Fase 2: Rilevazione Casi Noti (solo per un'esecuzione 'completed')
  runbook di finestra:
    valuta tutti i casi noti, in ordine di dichiarazione, sul contesto finale
  runbook con albero degli errori (§19):
    enumera i nodi radice, esegue i loro step, legge le discese a lotti finché ce ne sono
    poi, dal nodo più profondo: step afterDescend, branchOutcome, casi del livello del nodo
  togli i casi sostituiti (supersedes)
  ordina le rilevazioni per firstSeenAt

Fase 3: Esecuzione Azioni
  esegui l'azione di ogni rilevazione, in ordine
  (con l'albero: una volta per gruppo di catene, dal nodo che ha riconosciuto il caso),
  oppure la fallback action se non c'è nessuna rilevazione
```

---

## 6. Azioni dei Casi Noti

```typescript
/**
 * Azione da eseguire quando un caso noto viene riconosciuto.
 */
type CaseAction = LogAction | NotifyAction | UpdateAction | EscalateAction | CompositeAction;

/** Logga il risultato (per casi informativi) */
interface LogAction {
  readonly type: 'log';
  readonly level: 'info' | 'warn' | 'error';
  readonly message: string; // Supporta {{vars.xxx}}
}

/** Invia notifica (Slack, email, etc.) */
interface NotifyAction {
  readonly type: 'notify';
  readonly channel: string;
  readonly template: string;
}

/** Esegue un aggiornamento (DynamoDB, API, etc.) */
interface UpdateAction {
  readonly type: 'update';
  /** Step di mutation da eseguire */
  readonly step: Step;
}

/** Escalation a team/persona */
interface EscalateAction {
  readonly type: 'escalate';
  readonly team: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
}

/** Composizione di più azioni */
interface CompositeAction {
  readonly type: 'composite';
  readonly actions: readonly CaseAction[];
}
```

---

## 7. Service Registry

I servizi sono iniettati nel contesto e disponibili a tutti gli step. Questo permette il testing con mock.

```typescript
/**
 * Registry dei servizi disponibili per gli step.
 * Segue il pattern di dependency injection.
 */
interface ServiceRegistry {
  readonly cloudWatchLogs: AWSCloudWatchLogsQueryService; // @pagopa/go-aws/cloudwatch-logs/insights
  readonly cloudWatchMetrics: RunbookCloudWatchMetricsPort;
  readonly athena: RunbookAthenaPort;
  readonly dynamodb: RunbookDynamoDBPort;
  readonly http: GOHttpClient;
  readonly reporter: RunbookReporter;
  readonly awsAccounts?: AwsAccountsPort; // account logici, solo se configurati (§7.1)
}
```

I campi AWS sono tipizzati con contratti senza SDK: il contratto Logs Insights di go-aws e le porte di
go-runbook (`toolkits/common/services/ports/`). I servizi concreti di go-aws (`AWSCloudWatchLogsService`,
`AWSCloudWatchMetricsService`, `AWSAthenaService`, `AWSDynamoDBService`) li soddisfano strutturalmente, e
`createServiceRegistry` (`@pagopa/go-runbook/runtime`) li compone. Così i `.d.ts` dell'engine non richiedono
nessun pacchetto `@aws-sdk/*`. Per eseguire un runbook su un'occorrenza, il registry costruito una volta si lega
all'account e alla regione dell'occorrenza con `bindServicesToOccurrence`.

### 7.1 Account, ambienti e permessi

Quasi tutti i runbook leggono l'account dell'occorrenza con `cloudWatchLogs`. Alcuni leggono **anche altri account**:
per esempio i due account SEND (core e confinfo) per la stessa Lambda, o l'account confinfo per spidhub. Per questi
vale una regola: **nel codice del runbook non ci sono account id, ARN con account né nomi di profilo AWS.** I package
`@pagopa/*` sono pubblicati, e i nomi dei profili sono arbitrari e diversi su ogni macchina.

#### Modello

| Concetto                                  | Esempio                      | Dove sta                                                                                                         |
| ----------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Account logico** `<prodotto>/<account>` | `send/core`, `send/confinfo` | nel codice: `parseAwsLogicalAccount('send/core')`; per SEND `SEND_ACCOUNTS.core` / `.confinfo` (`toolkits/send`) |
| **Ambiente**                              | `prod`, `uat`                | ricavato dall'account dell'occorrenza; senza occorrenza da `aws.account.environment`                             |
| **Rubrica**                               | `send/core/prod=<id>`        | nella configurazione d'esecuzione (`aws.account.directory`), mai nel codice                                      |
| **Credenziali**                           | profilo locale o OAM         | scelte dal runtime (`aws.account.binding`), mai dal runbook                                                      |

Un account id appartiene a un solo ambiente: l'ambiente di un'occorrenza si ricava dal suo account.

#### Dichiarare gli account in uno step

Uno step che legge altri account dichiara una `AwsAccountSelection` con `accountSelections()` e richiede il servizio
`awsAccounts`:

```typescript
import { awsLogicalAccountName, resolveAwsAccountSelection, SEND_ACCOUNTS, type AwsAccountSelection } from '…';

const ACCOUNTS: AwsAccountSelection = {
  subject: 'pn-logsaver-be diagnostics', // nome del lettore nei messaggi d'errore
  accounts: [SEND_ACCOUNTS.core, SEND_ACCOUNTS.confinfo],
  scope: 'occurrence-account', // oppure 'every-account'
  environments: ['prod'], // facoltativo: ambienti in cui lo step può leggere
};

class QueryDiagnosticsStep extends OperationalStep</* … */> {
  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs', 'awsAccounts'];
  }

  override accountSelections(): ReadonlyArray<AwsAccountSelection> {
    return [ACCOUNTS];
  }

  override async execute(context: OperationalContext): Promise<StepResult<Rows>> {
    const port = context.services.awsAccounts!; // Safe: required above, checked before the first step
    for (const resolved of resolveAwsAccountSelection(context, ACCOUNTS)) {
      const reader = port.cloudWatchLogsFor(resolved.account); // esattamente quell'account, nessun fallback
      // … query su reader, etichettate con awsLogicalAccountName(resolved.account)
    }
    // …
  }
}
```

- **`scope: 'every-account'`:** legge tutti gli account elencati, nell'ambiente dell'esecuzione.
- **`scope: 'occurrence-account'`:** con un'occorrenza legge solo l'account logico dell'occorrenza; senza occorrenza
  li legge tutti.
- In entrambi i casi un'occorrenza che non appartiene a nessuno degli account elencati è rifiutata.
- `QueryLambdaAcrossAccountsStep` (`toolkits/common`, famiglia `lambda`) accetta direttamente una selezione in `sources`.

#### Verifica preliminare

Prima del primo step `OperationalRunbookEngine` raccoglie le selezioni di tutti gli step, compresi quelli annidati, e
con la porta:

1. determina l'ambiente;
2. risolve ogni account logico nella rubrica;
3. prepara i lettori, senza leggere log.

Se qualcosa manca, l'esecuzione fallisce **prima di qualsiasi lettura** con un `AwsAccountError` (`isAwsAccountError`),
il cui `code` è stabile:

| `code`                                   | Quando                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `AWS_ACCOUNT_NOT_CONFIGURED`             | la rubrica non ha la voce `<prodotto>/<account>/<ambiente>`                           |
| `AWS_ACCOUNT_DIRECTORY_INVALID`          | solo in un host di lunga durata: rubrica o modalità non valide (vedi sotto)           |
| `AWS_ACCOUNT_ENVIRONMENT_NOT_CONFIGURED` | senza occorrenza manca `aws.account.environment`                                      |
| `AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED`    | l'ambiente non è tra gli `environments` della selezione                               |
| `AWS_OCCURRENCE_ACCOUNT_MISMATCH`        | l'account dell'occorrenza non è nella rubrica o non è tra gli account della selezione |
| `AWS_ACCOUNT_SELECTION_AMBIGUOUS`        | due account logici della selezione puntano allo stesso account fisico                 |
| `AWS_ACCOUNT_UNREACHABLE`                | nessuna credenziale raggiunge l'account nella regione dell'esecuzione                 |

**Rubrica o modalità non valide** (formato, voci duplicate, un account in due ambienti, modalità sconosciuta) si
scoprono costruendo i servizi, prima del motore:

- in go-analyze-alarm e go-rta-check `createAwsAccountsPort` fallisce all'avvio con un `Error` ordinario, non un
  `AwsAccountError`;
- un host di lunga durata (per esempio una Lambda che importa il package pubblicato) può non fermarsi: con
  `UnavailableAwsAccountsPort` (`@pagopa/go-runbook/runtime`) solo un runbook che dichiara account logici fallisce,
  prima del primo step, con `AWS_ACCOUNT_DIRECTORY_INVALID`.

Un `AwsAccountError` è un errore di configurazione, non temporaneo: il `code` dice all'host che ritentare non serve; il
messaggio è prefissato dal codice.

#### Configurazione

| Chiave                        | Variabile d'ambiente          | Valori                                                           |
| ----------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| `aws.account.directory`       | `AWS_ACCOUNT_DIRECTORY`       | voci `<prodotto>/<account>/<ambiente>=<id>`, separate da virgola |
| `aws.account.binding`         | `AWS_ACCOUNT_BINDING`         | `profiles` o `oam`; default per host (vedi sotto)                |
| `aws.account.environment`     | `AWS_ACCOUNT_ENVIRONMENT`     | solo go-analyze-alarm, che non ha un'occorrenza                  |
| `aws.account.permission.sets` | `AWS_ACCOUNT_PERMISSION_SETS` | permission set SSO preferiti, in ordine; solo `profiles`         |

- **Default della modalità**, quando `aws.account.binding` manca:
  - go-analyze-alarm e go-rta-check: `profiles`;
  - un'esecuzione nel cloud non ha profili locali: l'host configura `oam`.
- **`profiles`:** il runtime chiede a STS l'identità di ogni profilo configurato (`--aws-profiles`), tiene quelli
  dell'account **e** della regione dell'esecuzione e, se sono più d'uno, preferisce il permission set ricavato
  dall'ARN della sessione SSO. Il nome del profilo non conta.
- **`oam`:** i lettori interrogano dall'account di monitoraggio l'account esatto, tramite il collegamento OAM.
- **Dove sta la rubrica:**
  - in locale, nella configurazione dello script o nell'ambiente dell'utente; il formato è documentato da
    `scripts/go/go-analyze-alarm/configs/aws-accounts.example.env`, con id sintetici;
  - nel cloud, nella configurazione dell'host che importa il package (`AWS_ACCOUNT_DIRECTORY` con
    `AWS_ACCOUNT_BINDING=oam`); ogni account della rubrica dev'essere collegato all'account di monitoraggio.
- Un runbook che non dichiara account logici non richiede nessuna di queste chiavi.

#### Riservatezza, output e cache

- Gli errori dei lettori non portano nomi di profilo: i riferimenti `(profile: …)` sono rimossi e gli errori dei
  provider di credenziali dell'SDK diventano `[<nome>] AWS credentials could not be resolved`. Il testo originale va
  solo alle diagnostiche locali.
- L'output del runbook riporta in `details.awsAccounts` gli account logici risolti nell'esecuzione.
- Le voci di copertura (`StepCoverage.source`, `detail`) usano etichette sicure (account logico, log group), mai nomi
  di profilo. Prima di salvare traccia e output, go-analyze-alarm e go-rta-check li ripuliscono con
  `scrubAwsProfileNamesDeep` (`@pagopa/go-runbook/runtime`), che toglie i nomi dei profili configurati da ogni stringa
  dell'oggetto.
- go-rta-check include account logici, ambiente, voci della rubrica e preferenze nell'impronta della cache, e non
  mette in cache i fallimenti che dipendono dalle credenziali.

#### Test

```typescript
const awsAccounts = new InMemoryAwsAccountsPort({
  directory: parseAwsAccountDirectory(['send/core/uat=000000000000']), // solo id sintetici
  region: 'eu-south-1',
  environment: 'uat',
  readers: { 'send/core': coreReader },
});
const services = createTestServiceRegistry({ awsAccounts });
```

`InMemoryAwsAccountsPort` usa la stessa logica di rubrica e ambiente del runtime, con lettori in memoria.

#### Gate dei package pubblicati

- `pnpm check:published`: impacchetta `@pagopa/*` con `pnpm pack` e cerca account id, ARN con account e nomi di
  profilo in ogni file dell'archivio (job CI `published`).
- `pnpm check:published:sources`: stesso controllo sui sorgenti, passo di `pnpm lint`.
- ESLint vieta i letterali di 12 cifre nei sorgenti pubblicati.
- Id ammessi negli esempi: `000000000000` e `123456789012`. Regole ed eccezioni motivate:
  `published-sensitive-data.config.json`.

---

## 8. Builder API

Per semplificare la definizione dei runbook, un builder fluent con **validazione automatica**.

````typescript
/**
 * Errore di validazione del runbook.
 * Contiene tutti gli errori trovati durante la validazione.
 */
class RunbookValidationError extends Error {
  constructor(
    readonly runbookId: string,
    readonly errors: readonly ValidationErrorEntry[],
  ) {
    const errorList = errors.map((e, i) => `  ${i + 1}. [${e.code}] ${e.message}`).join('\n');
    super(`Validazione fallita per runbook "${runbookId}" (${errors.length} errori):\n${errorList}`);
    this.name = 'RunbookValidationError';
  }
}

/**
 * Singola entry di errore di validazione.
 */
interface ValidationErrorEntry {
  /** Codice errore per identificazione programmatica */
  readonly code: ValidationErrorCode;
  /** Messaggio leggibile */
  readonly message: string;
  /** ID dello step coinvolto (se applicabile) */
  readonly stepId?: string;
  /** ID del KnownCase coinvolto (se applicabile) */
  readonly caseId?: string;
}

/**
 * Codici di errore per la validazione del runbook.
 */
type ValidationErrorCode =
  | 'DUPLICATE_STEP_ID'
  | 'DUPLICATE_CASE_ID'
  | 'UNKNOWN_SUPERSEDED_CASE'
  | 'SUPERSEDES_CYCLE'
  | 'MISSING_METADATA'
  | 'MISSING_FALLBACK'
  | 'EMPTY_STEPS';

/**
 * Builder fluent per la creazione di runbook.
 * Include validazione automatica prima del build.
 *
 * @example
 * ```typescript
 * const runbook = RunbookBuilder.create('alarm-api-gw-5xx')
 *   .metadata({
 *     name: 'API Gateway 5xx Alarm',
 *     description: 'Indaga allarmi 5xx su API Gateway',
 *     version: '1.0.0',
 *     type: 'alarm-resolution',
 *     team: 'GO',
 *     tags: ['api-gateway', '5xx', 'alarm'],
 *   })
 *   .step(new CloudWatchLogsQueryStep({ ... }))
 *   .step(new SetVarStep({ ... }), { continueOnFailure: true })
 *   .knownCase({ ... })
 *   .fallback(logAction({ ... }))
 *   .maxIterations(500)
 *   .build(); // chiama validate() automaticamente
 * ```
 */
class RunbookBuilder {
  private readonly id: string;
  private meta?: Omit<RunbookMetadata, 'id'>;
  private readonly stepDescriptors: StepDescriptor[] = [];
  private readonly cases: KnownCase[] = [];
  private fallbackAction?: CaseAction;
  private iterationsLimit?: number;

  private constructor(id: string) {
    this.id = id;
  }

  /**
   * Crea un nuovo builder per un runbook con l'ID specificato.
   *
   * @param id - Identificativo univoco del runbook
   * @returns Nuova istanza del builder
   */
  static create(id: string): RunbookBuilder {
    return new RunbookBuilder(id);
  }

  /**
   * Imposta i metadati del runbook.
   */
  metadata(meta: Omit<RunbookMetadata, 'id'>): RunbookBuilder {
    this.meta = meta;
    return this;
  }

  /**
   * Aggiunge uno step al runbook.
   * Supporta un secondo parametro opzionale per le opzioni di esecuzione.
   *
   * @param step - Lo step da aggiungere
   * @param options - Opzioni di esecuzione (es. continueOnFailure)
   */
  step(step: Step, options?: { readonly continueOnFailure?: boolean }): RunbookBuilder {
    this.stepDescriptors.push({
      step,
      continueOnFailure: options?.continueOnFailure,
    });
    return this;
  }

  /**
   * Aggiunge un caso noto al runbook.
   */
  knownCase(knownCase: KnownCase): RunbookBuilder {
    this.cases.push(knownCase);
    return this;
  }

  /**
   * Imposta l'azione di fallback per quando nessun caso noto corrisponde.
   */
  fallback(action: CaseAction): RunbookBuilder {
    this.fallbackAction = action;
    return this;
  }

  /**
   * Configura il numero massimo di iterazioni.
   *
   * @param max - Limite massimo (default: 1000)
   */
  maxIterations(max: number): RunbookBuilder {
    this.iterationsLimit = max;
    return this;
  }

  /**
   * Dichiara i livelli che il runbook indaga dopo gli step della finestra, un nodo per errore (§19).
   *
   * @param tree - Livello radice e livelli in cui scendere
   */
  errorTree(tree: ErrorTreeDefinition): RunbookBuilder {
    this.treeDefinition = tree;
    return this;
  }

  /**
   * Esegue la validazione del runbook.
   * Controlla: step ID duplicati, KnownCase con ID duplicati, supersedes verso casi
   * inesistenti o in ciclo.
   *
   * @returns Array di errori di validazione (vuoto se valido)
   */
  validate(): readonly ValidationErrorEntry[] {
    const errors: ValidationErrorEntry[] = [];

    // 1. Verifica metadati e fallback
    if (this.meta === undefined) {
      errors.push({
        code: 'MISSING_METADATA',
        message: 'Metadati del runbook non impostati. Usare .metadata() prima di .build().',
      });
    }

    if (this.fallbackAction === undefined) {
      errors.push({
        code: 'MISSING_FALLBACK',
        message: 'Azione di fallback non impostata. Usare .fallback() prima di .build().',
      });
    }

    if (this.stepDescriptors.length === 0) {
      errors.push({
        code: 'EMPTY_STEPS',
        message: 'Nessuno step definito. Aggiungere almeno uno step con .step().',
      });
    }

    // 2. Verifica step ID duplicati
    const stepIds = new Set<string>();
    for (const descriptor of this.stepDescriptors) {
      if (stepIds.has(descriptor.step.id)) {
        errors.push({
          code: 'DUPLICATE_STEP_ID',
          message: `Step ID duplicato: "${descriptor.step.id}". Ogni step deve avere un ID univoco.`,
          stepId: descriptor.step.id,
        });
      }
      stepIds.add(descriptor.step.id);
    }

    // 3. Verifica KnownCase ID duplicati
    const caseIds = new Set<string>();
    for (const knownCase of this.cases) {
      if (caseIds.has(knownCase.id)) {
        errors.push({
          code: 'DUPLICATE_CASE_ID',
          message: `KnownCase ID duplicato: "${knownCase.id}". Ogni caso deve avere un ID univoco.`,
          caseId: knownCase.id,
        });
      }
      caseIds.add(knownCase.id);
    }

    // 4. Verifica supersedes: ogni caso sostituito esiste, nessun caso sostituisce se stesso,
    //    le sostituzioni non formano cicli (DFS sul grafo caso -> casi sostituiti)
    errors.push(...validateSupersedes(this.cases)); // UNKNOWN_SUPERSEDED_CASE, SUPERSEDES_CYCLE

    return errors;
  }

  /**
   * Costruisce il runbook.
   * Chiama automaticamente validate() e lancia RunbookValidationError se ci sono errori.
   *
   * @returns Il runbook validato e pronto per l'esecuzione
   * @throws RunbookValidationError se la validazione fallisce
   */
  build(): Runbook {
    // Validazione automatica
    const validationErrors = this.validate();
    if (validationErrors.length > 0) {
      throw new RunbookValidationError(this.id, validationErrors);
    }

    return {
      metadata: {
        id: this.id,
        ...this.meta!, // Safe: validato nel validate()
      },
      steps: [...this.stepDescriptors],
      knownCases: [...this.cases],
      fallbackAction: this.fallbackAction!, // Safe: validato nel validate()
      maxIterations: this.iterationsLimit,
    };
  }
}
````

### Step Construction

Gli step principali sono classi istanziabili direttamente; alcune API storiche
mantengono ancora factory function dedicate.

```typescript
// Data steps
new CloudWatchLogsQueryStep(config: CloudWatchLogsQueryConfig);

// Control flow steps
function setVar(config: SetVarConfig): SetVarStep;

// Actions
function logAction(config: LogActionConfig): LogAction;
```

---

## 9. Esempio Concreto: Alarm Resolution per API Gateway 5xx

> **Esempio didattico.** Mostra i concetti del motore (step, `stop`, casi noti, rilevazioni e `supersedes`). Alcuni helper usati qui (`extractField`, `regexExtract`, `setVar`, `log`, `stop`) e la firma semplificata di `createServiceRegistry` servono solo all'esempio e non fanno parte dell'API. I runbook reali sono in `packages/go-runbook/src/inventory/` e si costruiscono con i toolkit (`@pagopa/go-runbook/toolkits/send`, `…/toolkits/interop`); quelli SEND API Gateway indagano ogni richiesta con l'albero degli errori (§19.12).

### Scenario

Un allarme CloudWatch `pn-address-book-io-IO-ApiGwAlarm` scatta. Il runbook deve:

1. Cercare nei log di CloudWatch l'errore che ha causato l'allarme
2. Estrarre il codice di errore e il traceId
3. Verificare la latenza del downstream per gli errori di timeout (`504`)
4. Alla fine della pipeline, valutare **tutti** i casi noti e agire per ciascuno di quelli rilevati
5. Quando due casi descrivono lo stesso errore, tenere solo il più preciso (`supersedes`)

### Definizione del Runbook

```typescript
import { RunbookBuilder } from '@pagopa/go-runbook';
import { CloudWatchLogsQueryStep } from '@pagopa/go-runbook/toolkits/common';
// extractField, regexExtract, setVar, log e stop: helper illustrativi di questo esempio.

// ---------------------------------------------------------------
// Runbook: API Gateway 5xx Alarm Resolution
// ---------------------------------------------------------------

const apiGateway5xxRunbook = RunbookBuilder.create('alarm-api-gw-5xx')
  .metadata({
    name: 'API Gateway 5xx Alarm Resolution',
    description: 'Investigazione e risoluzione allarmi 5xx su API Gateway',
    version: '3.0.0',
    type: 'alarm-resolution',
    team: 'GO',
    tags: ['api-gateway', '5xx', 'alarm'],
  })

  // Limite iterazioni esplicito
  .maxIterations(200)

  // -- STEP 1: Query CloudWatch Logs per trovare gli errori 5xx --
  .step(
    new CloudWatchLogsQueryStep({
      id: 'query-5xx-errors',
      label: 'Cerca errori 5xx nei log di API Gateway',
      logGroups: ['/aws/apigateway/pn-address-book-io'],
      query: `
        fields @timestamp, @message, status, traceId, errorCode, latency
        | filter status >= 500
        | sort @timestamp desc
        | limit 50
      `,
      // timeRange viene dai params del runbook
      timeRangeFromParams: { start: 'alarmStartTime', end: 'alarmEndTime' },
    }),
  )

  // -- STEP 3: Estrai il codice di stato più frequente --
  // continueOnFailure: se l'estrazione fallisce, prosegui comunque
  .step(
    extractField({
      id: 'extract-status-code',
      label: 'Estrai status code prevalente',
      fromStep: 'query-5xx-errors',
      fieldPath: '[0].status',
      saveAs: 'statusCode',
    }),
    { continueOnFailure: true },
  )

  // -- STEP 4: Estrai il traceId del primo errore --
  // continueOnFailure: il traceId e utile ma non critico
  .step(
    extractField({
      id: 'extract-trace-id',
      label: 'Estrai traceId',
      fromStep: 'query-5xx-errors',
      fieldPath: '[0].traceId',
      saveAs: 'traceId',
    }),
    { continueOnFailure: true },
  )

  // -- STEP 5: Estrai errorCode dal messaggio --
  // L'estrazione non ferma la pipeline: errorCode diventa evidenza per i casi noti,
  // valutati solo alla fine.
  .step(
    regexExtract({
      id: 'extract-error-code',
      label: 'Estrai codice errore dal messaggio',
      fromStep: 'query-5xx-errors',
      fieldPath: '[0].@message',
      pattern: '"errorCode":\\s*"([A-Z_]+)"',
      group: 1,
      saveAs: 'errorCode',
    }),
    { continueOnFailure: true },
  )

  // -- STEP 6: Latenza dei downstream per gli errori 504 (timeout) --
  .step(
    new CloudWatchLogsQueryStep({
      id: 'query-downstream-latency',
      label: 'Analizza latenza downstream',
      logGroups: ['/aws/apigateway/pn-address-book-io'],
      query: `
        fields @timestamp, latency, downstreamService, downstreamLatency
        | filter status = 504
        | stats avg(downstreamLatency) as avgLatency,
                max(downstreamLatency) as maxLatency
                by downstreamService
        | sort maxLatency desc
      `,
      timeRangeFromParams: { start: 'alarmStartTime', end: 'alarmEndTime' },
    }),
  )
  .step(
    extractField({
      id: 'extract-slow-service',
      label: 'Identifica servizio più lento',
      fromStep: 'query-downstream-latency',
      fieldPath: '[0].downstreamService',
      saveAs: 'slowService',
    }),
    { continueOnFailure: true },
  )

  // -- STEP 7: Imposta diagnosi --
  .step(
    setVar({
      id: 'set-diagnosis',
      label: 'Imposta diagnosi',
      varName: 'diagnosis',
      expression: '{{vars.statusCode}} - {{vars.errorCode}}',
    }),
  )

  // -- STEP 8: Log riassuntivo --
  .step(
    log({
      id: 'log-summary',
      label: 'Log riassunto investigazione',
      level: 'info',
      message: 'Diagnosi: {{vars.diagnosis}} | TraceId: {{vars.traceId}}',
    }),
  )

  // -- STEP 9: Fine dell'indagine --
  // `next: 'stop'`: chiude la pipeline. I casi noti vengono valutati comunque.
  .step(stop({ id: 'end-investigation', label: 'Fine indagine' }))

  // ---------------------------------------------------------------
  // CASI NOTI
  // ---------------------------------------------------------------

  // I casi si valutano in ordine di dichiarazione e si riportano tutti quelli che corrispondono.

  // Caso 1: Timeout dovuto a downstream lento
  .knownCase({
    id: 'downstream-timeout',
    description: 'Timeout causato da servizio downstream lento',
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.statusCode', operator: '==', value: '504' },
        { type: 'exists', ref: 'vars.slowService' },
      ],
    },
    action: {
      type: 'composite',
      actions: [
        {
          type: 'notify',
          channel: 'slack:#go-alerts',
          template: [
            ':warning: *Timeout su API Gateway*',
            'Servizio lento: `{{vars.slowService}}`',
            'TraceId: `{{vars.traceId}}`',
            'Azione: verificare stato del servizio downstream',
          ].join('\n'),
        },
        {
          type: 'escalate',
          team: 'platform',
          severity: 'medium',
          message: 'Servizio {{vars.slowService}} causa timeout su API GW',
        },
      ],
    },
  })

  // Caso 2: Rate limiting (429 trasformato in 5xx)
  // Un 500 con errorCode RATE_LIMIT soddisfa anche "internal-error": questo caso è la
  // spiegazione più precisa dello stesso errore, quindi lo sostituisce.
  .knownCase({
    id: 'rate-limiting',
    description: 'Errore causato da throttling / rate limiting',
    supersedes: ['internal-error'],
    condition: {
      type: 'pattern',
      ref: 'vars.errorCode',
      regex: 'THROTTL|RATE_LIMIT|TOO_MANY_REQUESTS',
    },
    action: {
      type: 'notify',
      channel: 'slack:#go-alerts',
      template: [
        ':traffic_light: *Rate Limiting su API Gateway*',
        'ErrorCode: `{{vars.errorCode}}`',
        'Azione: verificare limiti di throttling e scalare se necessario',
      ].join('\n'),
    },
  })

  // Caso 3: Internal Server Error generico
  .knownCase({
    id: 'internal-error',
    description: 'Errore interno del servizio',
    condition: {
      type: 'compare',
      ref: 'vars.statusCode',
      operator: '==',
      value: '500',
    },
    action: {
      type: 'escalate',
      team: 'GO',
      severity: 'high',
      message: 'Errore 500 su API GW. ErrorCode: {{vars.errorCode}}, TraceId: {{vars.traceId}}',
    },
  })

  // Fallback: caso non riconosciuto
  .fallback({
    type: 'escalate',
    team: 'GO',
    severity: 'high',
    message: 'Caso non riconosciuto. Diagnosi: {{vars.diagnosis}}, TraceId: {{vars.traceId}}',
  })

  .build();
```

### Come vengono rilevati i casi in questo esempio

Il motore esegue sempre la pipeline fino in fondo (o fino a `stop`) e solo dopo valuta i casi noti.

**Scenario A: status `500`, errorCode = `RATE_LIMIT`**

1. Step 1 (`query-5xx-errors`): query CloudWatch, trova errori 500 con `RATE_LIMIT` -> `next: 'continue'`
2. Step 3-5: estraggono `500`, il traceId e `RATE_LIMIT` -> `next: 'continue'`
3. Step 6: nessun errore 504, nessun servizio lento
4. Step 7-8: diagnosi e log; step 9 (`end-investigation`) -> `next: 'stop'`
5. Valutazione dei casi, in ordine di dichiarazione:
   - `downstream-timeout` non corrisponde (status non è 504)
   - `rate-limiting` corrisponde (pattern `RATE_LIMIT`)
   - `internal-error` corrisponde (status 500), ma `rate-limiting` lo sostituisce (`supersedes`): esce dalle
     rilevazioni e resta nella traccia con `supersededBy: 'rate-limiting'`
6. Una rilevazione, `rate-limiting`: si esegue la sua azione

**Scenario B: status `504`, errorCode = `DOWNSTREAM_TIMEOUT`**

1. Step 1-5: come sopra, estraggono `504` e `DOWNSTREAM_TIMEOUT`
2. Step 6: la latenza dei downstream imposta `vars.slowService`
3. Step 7-9: diagnosi, log e `stop`
4. Al termine corrisponde solo `downstream-timeout`: una rilevazione, una azione

Se più casi indipendenti corrispondono (nessuno sostituisce l'altro), il risultato li riporta tutti e il motore esegue
l'azione di ciascuno. Qui le condizioni leggono solo variabili scalari, che non hanno tempo: le rilevazioni seguono
l'ordine di dichiarazione. Un caso la cui condizione legge le righe di uno step (per esempio un `pattern` su
`steps.query-5xx-errors.output`) prende invece `firstSeenAt`/`lastSeenAt` dalle righe che l'hanno soddisfatto, e le
rilevazioni si ordinano per tempo.

### Esecuzione del Runbook

```typescript
import { GOScript } from '@go-automation/go-script';
import { OperationalRunbookEngine } from '@pagopa/go-runbook/toolkits/common';
import { createServiceRegistry } from '@pagopa/go-runbook/runtime';
import { apiGateway5xxRunbook } from './runbooks/apiGateway5xx';

// Dentro uno script GOScript
const script = new GOScript({
  metadata: { name: 'Runbook Runner', version: '1.0.0', description: 'Esegue runbook' },
  config: {
    parameters: [
      { name: 'alarmName', type: 'string', required: true },
      { name: 'alarmStartTime', type: 'string', required: true },
      { name: 'alarmEndTime', type: 'string', required: true },
    ],
  },
});

await script.run(async (ctx) => {
  // Setup servizi
  const services = createServiceRegistry(ctx.aws, ctx.logger);

  // Parametri dall'allarme
  const params = new Map<string, string>([
    ['alarmName', ctx.config.get('alarmName')],
    ['alarmStartTime', ctx.config.get('alarmStartTime')],
    ['alarmEndTime', ctx.config.get('alarmEndTime')],
  ]);

  // Esegui runbook (OperationalRunbookEngine legge il tempo dell'evidenza dalle righe dei log)
  const engine = new OperationalRunbookEngine(ctx.logger);
  const result = await engine.execute(apiGateway5xxRunbook, params, services, {
    invokedBy: 'manual',
    awsProfiles: ['my-profile'],
    region: 'eu-south-1',
  });

  // Output risultato
  ctx.logger.section('Risultato Esecuzione');
  ctx.logger.info(`Runbook: ${result.runbookId}`);
  ctx.logger.info(`Stato: ${result.status}`);
  ctx.logger.info(`Durata: ${result.durationMs}ms`);
  ctx.logger.info(`Step eseguiti: ${result.stepsExecuted}`);

  // Ogni caso rilevato, in ordine di tempo della prima evidenza
  if (result.detections.length === 0) ctx.logger.info('Nessun caso noto');
  for (const detection of result.detections) {
    ctx.logger.info(`${detection.firstSeenAt ?? '-'} ${detection.knownCase.description}`);
  }

  // Cosa il runbook non ha potuto vedere
  for (const entry of result.coverage) {
    ctx.logger.warn(`Evidenza incompleta [${entry.stepId}]: ${entry.reason ?? 'unavailable'}`);
  }

  // Mostra errori recuperati
  if (result.recoveredErrors.length > 0) {
    ctx.logger.section('Errori Recuperati (continueOnFailure)');
    for (const err of result.recoveredErrors) {
      ctx.logger.warn(`Step "${err.stepId}" fallito: ${err.originalError}`);
    }
  }
});
```

---

## 10. Diagramma del Flusso di Esecuzione

```
+----------------------------------------------------------------------+
|                          RunbookEngine                                |
+----------------------------------------------------------------------+
|                                                                       |
|  1. INIT                                                              |
|  +----------+    +--------------+                                     |
|  |  Params   |--->   Context    |                                     |
|  +----------+    |  (immutable) |                                     |
|                  +------+-------+                                     |
|                         |                                             |
|  2. EXECUTE STEPS       v                                             |
|  +------------------------------------------------------------------+ |
|  |  [anti-loop: iterations <= maxIterations]                         | |
|  |                                                                   | |
|  |  +---------+   +---------+   +--------+                          | |
|  |  | Step 1  |-->| Step 2  |-->| Step N |                          | |
|  |  | (data)  |   |(extract)|   |  ...   |                          | |
|  |  |continue |   |continue |   +---+----+                          | |
|  |  |OnFailure|   |OnFailure|       |                               | |
|  |  +---------+   +---------+   next='stop'                         | |
|  |                              o fine step                         | |
|  |                                                                   | |
|  |  Per ogni step: coverage, observedErrors                          | |
|  |  Step fallito -> voce di copertura 'unavailable':                 | |
|  |    - dopo una lettura riuscita: BREAK, stato 'completed'          | |
|  |    - prima di ogni lettura:     BREAK, stato 'failed'             | |
|  +------------------------------------------------------------------+ |
|                         |                                             |
|  3. DETECT KNOWN CASES  v   (solo se lo stato e 'completed')          |
|  +------------------------------------------------------------------+ |
|  |  Contesto finale                                                  | |
|  |                                                                   | |
|  |  KnownCase 1 --match?--+                                          | |
|  |  KnownCase 2 --match?--+--> togli i casi sostituiti (supersedes)  | |
|  |  KnownCase 3 --match?--+--> ordina per firstSeenAt                | |
|  |  KnownCase 4 --match?--+          |                               | |
|  |   (ordine di dichiarazione)       v                               | |
|  |                         detections[] ---> azione di ognuna        | |
|  |                               |                                   | |
|  |                      vuoto?   v                                   | |
|  |                      +--------------+                             | |
|  |                      | Fallback     |                             | |
|  |                      | Action       |                             | |
|  |                      +--------------+                             | |
|  +------------------------------------------------------------------+ |
|                                                                       |
|  4. RESULT                                                            |
|  +------------------------------------------------------------------+ |
|  | RunbookExecutionResult {                                          | |
|  |   runbookId, status, detections, coverage, observedErrors?,       | |
|  |   durationMs, stepsExecuted, finalContext, recoveredErrors, trace | |
|  | }                                                                 | |
|  +------------------------------------------------------------------+ |
+----------------------------------------------------------------------+
```

---

## 11. Trace

### 11.1 Panoramica

Al termine di ogni esecuzione, il motore produce un **trace strutturato** (`RunbookExecutionTrace`) che documenta nel dettaglio ogni fase dell'esecuzione: step eseguiti, variabili prodotte, casi noti valutati e rilevati, azioni eseguite e copertura dell'evidenza.

Il trace e progettato per quattro scenari di utilizzo:

| Scenario                  | Descrizione                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| **Persistenza**           | Salvataggio su DynamoDB/S3 per storicizzazione e audit trail                                        |
| **Analisi LLM**           | Input strutturato per un modello di linguaggio che analizza l'esecuzione e suggerisce miglioramenti |
| **Debugging**             | Ricostruzione esatta del flusso di esecuzione per identificare problemi                             |
| **Dashboard / Reporting** | Estrazione di metriche aggregate (durata, step falliti, casi noti più frequenti)                    |

Il campo `schemaVersion` garantisce compatibilita in avanti: i consumatori possono gestire versioni diverse del formato senza rotture.

---

### 11.2 Interfacce TypeScript

Tutte le interfacce seguono le convenzioni del progetto: `readonly` su ogni proprietà, named exports, un file per interfaccia (vedi Sezione 12).

#### RunbookExecutionTrace

````typescript
/**
 * Trace strutturato dell'esecuzione completa di un runbook.
 * Prodotto dal motore al termine di ogni esecuzione.
 * Contiene tutte le informazioni necessarie per audit, debugging e analisi LLM.
 *
 * @example
 * ```typescript
 * const result = await engine.execute(runbook, params, services);
 * const trace = result.trace;
 * await s3.putObject({ Key: `traces/${trace.execution.executionId}.json`, Body: JSON.stringify(trace) });
 * ```
 */
interface RunbookExecutionTrace {
  /** Versione dello schema per compatibilita in avanti */
  readonly schemaVersion: '3.0.0';
  /** Informazioni generali sull'esecuzione */
  readonly execution: ExecutionInfo;
  /** Parametri di input forniti al runbook */
  readonly input: Readonly<Record<string, string>>;
  /** Trace di ogni step eseguito nella pipeline */
  readonly pipeline: readonly StepTrace[];
  /** Stato finale delle variabili al termine dell'esecuzione */
  readonly variables: Readonly<Record<string, string>>;
  /** Dettaglio della rilevazione dei casi noti */
  readonly caseMatching: CaseMatchingTrace;
  /**
   * Ogni azione eseguita, nell'ordine di esecuzione: una per rilevazione,
   * nell'ordine delle rilevazioni, oppure il fallback se nessun caso corrisponde.
   */
  readonly actionsExecuted: readonly ActionTrace[];
  /** Evidenza parziale dichiarata dagli step, o registrata dal motore per una lettura fallita */
  readonly coverage: readonly CoverageEntry[];
  /** Riepilogo sintetico dell'esecuzione */
  readonly summary: ExecutionSummary;
}
````

#### ExecutionInfo

```typescript
/**
 * Informazioni generali sull'esecuzione del runbook.
 * Include metadati del runbook, timestamp, durata e ambiente di esecuzione.
 */
interface ExecutionInfo {
  /** Identificativo univoco dell'esecuzione (UUID) */
  readonly executionId: string;
  /** ID del runbook eseguito */
  readonly runbookId: string;
  /** Nome leggibile del runbook */
  readonly runbookName: string;
  /** Versione del runbook */
  readonly runbookVersion: string;
  /** Tipologia del runbook (vedi Sezione 1) */
  readonly runbookType: RunbookType;
  /** Timestamp di inizio esecuzione (ISO 8601) */
  readonly startedAt: string;
  /** Timestamp di completamento esecuzione (ISO 8601) */
  readonly completedAt: string;
  /** Durata totale in millisecondi */
  readonly durationMs: number;
  /** Stato finale dell'esecuzione */
  readonly status: 'completed' | 'failed' | 'aborted';
  /** Motivo del fallimento (solo se status !== 'completed') */
  readonly failureReason?: string;
  /** Informazioni sull'ambiente di esecuzione */
  readonly environment: ExecutionEnvironment;
}

/**
 * Informazioni sull'ambiente di esecuzione.
 * Passato al motore tramite il parametro `environment` di `execute()`.
 */
interface ExecutionEnvironment {
  /** Profili AWS utilizzati */
  readonly awsProfiles: ReadonlyArray<string>;
  /** Regione AWS */
  readonly region: string;
  /** Modalità di invocazione del runbook */
  readonly invokedBy: 'manual' | 'alarm' | 'schedule';
}
```

#### StepTrace

```typescript
/**
 * Trace di un singolo step eseguito nella pipeline.
 * Contiene input, output, variabili scritte, durata e direttiva di flusso.
 */
interface StepTrace {
  /** Ordine di esecuzione (1-based) */
  readonly executionOrder: number;
  /** ID univoco dello step */
  readonly stepId: string;
  /** Etichetta leggibile dello step */
  readonly label: string;
  /** Categoria dello step (data, transform, control, check, mutation) */
  readonly kind: StepKind;
  /** Come lo step è stato raggiunto nel flusso di esecuzione */
  readonly reachedVia: 'sequential' | 'subPipeline';
  /** Timestamp di inizio esecuzione dello step (ISO 8601) */
  readonly startedAt: string;
  /** Timestamp di completamento dello step (ISO 8601) */
  readonly completedAt: string;
  /** Durata in millisecondi */
  readonly durationMs: number;
  /** Stato dello step */
  readonly status: 'success' | 'failed';
  /** Se lo step è stato recuperato tramite continueOnFailure (vedi Sezione 17.2) */
  readonly recovered: boolean;
  /** Input fornito allo step */
  readonly input: unknown;
  /** Output prodotto dallo step */
  readonly output: unknown;
  /** Messaggio di errore (solo se status === 'failed') */
  readonly error?: string;
  /** Variabili scritte nel contesto da questo step */
  readonly varsWritten: Readonly<Record<string, string>>;
  /** Diagnostiche di servizio/runtime, fuori dall'output funzionale */
  readonly diagnostics?: StepDiagnostics;
  /** Direttiva di flusso prodotta: 'continue' o 'stop' */
  readonly flowDirective: 'continue' | 'stop';
}
```

#### CaseMatchingTrace

```typescript
/**
 * Trace della rilevazione dei casi noti (vedi Sezione 5.3).
 * Documenta ogni caso valutato, la condizione applicata e il risultato.
 */
interface CaseMatchingTrace {
  /** Numero totale di casi valutati */
  readonly casesEvaluated: number;
  /** Dettaglio di ogni valutazione, in ordine di dichiarazione */
  readonly evaluations: readonly CaseEvaluationTrace[];
  /**
   * ID delle rilevazioni, nell'ordine delle rilevazioni: firstSeenAt crescente,
   * ordine di dichiarazione a pari merito, senza tempo in fondo.
   * I casi sostituiti non compaiono. Vuoto se nessun caso corrisponde.
   */
  readonly matchedCaseIds: readonly string[];
}

/**
 * Trace della valutazione di un singolo caso noto.
 * Include la condizione, i valori risolti, il risultato del match e, per un match, il suo tempo.
 */
interface CaseEvaluationTrace {
  /** ID del caso noto */
  readonly caseId: string;
  /** Descrizione leggibile del caso */
  readonly description: string;
  /** Condizione valutata (vedi Sezione 4) */
  readonly condition: Condition;
  /** Se la condizione ha fatto match */
  readonly matched: boolean;
  /** Valori effettivi delle variabili riferite nella condizione */
  readonly resolvedValues: Readonly<Record<string, unknown>>;
  /** Prima evidenza che soddisfa il caso (ISO-8601 UTC), per un match con tempo */
  readonly firstSeenAt?: string;
  /** Ultima evidenza che soddisfa il caso (ISO-8601 UTC), per un match con tempo */
  readonly lastSeenAt?: string;
  /** Righe di evidenza del match */
  readonly evidenceRows?: number;
  /** Il caso che ha sostituito questo, quando corrispondevano entrambi (vedi KnownCase.supersedes) */
  readonly supersededBy?: string;
}
```

#### ActionTrace

```typescript
/**
 * Trace di un'azione eseguita dopo la rilevazione dei casi noti (vedi Sezione 6):
 * una per rilevazione, nell'ordine delle rilevazioni, oppure il fallback.
 * Documenta il tipo di azione, il risultato e la durata.
 */
interface ActionTrace {
  /** Se un'azione è stata effettivamente eseguita */
  readonly executed: boolean;
  /** Tipo dell'azione eseguita */
  readonly actionType: 'log' | 'notify' | 'update' | 'escalate' | 'composite' | 'fallback';
  /** Dettaglio completo dell'azione (vedi CaseAction nella Sezione 6) */
  readonly actionDetail: CaseAction;
  /** Messaggio con le variabili risolte (template interpolato) */
  readonly resolvedMessage?: string;
  /** Stato dell'esecuzione dell'azione */
  readonly status: 'success' | 'failed';
  /** Messaggio di errore (solo se status === 'failed') */
  readonly error?: string;
  /** Durata dell'esecuzione dell'azione in millisecondi */
  readonly durationMs: number;
}
```

#### ExecutionSummary

```typescript
/**
 * Riepilogo sintetico dell'esecuzione del runbook.
 * Pensato per dashboard, notifiche e analisi rapida.
 */
interface ExecutionSummary {
  /** Descrizione leggibile del risultato dell'esecuzione */
  readonly description: string;
  /** Numero totale di step nel runbook */
  readonly totalSteps: number;
  /** Numero di step effettivamente eseguiti */
  readonly stepsExecuted: number;
  /** Numero di step falliti */
  readonly stepsFailed: number;
  /** Numero di step recuperati con continueOnFailure */
  readonly stepsRecovered: number;
  /** Numero di step saltati (non raggiunti dal flusso) */
  readonly stepsSkipped: number;
  /** Outcome sintetico: casi rilevati e prima azione eseguita, es. "rate-limiting -> notify" */
  readonly outcome: string;
}
```

---

### 11.3 RunbookExecutionResult

Il `RunbookExecutionResult` include il trace strutturato, le rilevazioni e la copertura dell'evidenza.

```typescript
/**
 * Risultato dell'esecuzione completa di un runbook.
 */
interface RunbookExecutionResult {
  /** ID del runbook eseguito */
  readonly runbookId: string;
  /** Stato finale dell'esecuzione */
  readonly status: 'completed' | 'failed' | 'aborted';
  /**
   * Ogni caso noto che corrisponde al contesto finale, ordinato per firstSeenAt
   * (ordine di dichiarazione a pari merito, senza tempo in fondo).
   * Vuoto se nessun caso corrisponde e si è eseguito il fallback.
   */
  readonly detections: ReadonlyArray<KnownCaseDetection>;
  /** Evidenza parziale dichiarata dagli step, o registrata dal motore per una lettura fallita */
  readonly coverage: ReadonlyArray<CoverageEntry>;
  /** Una lacuna di tutta la lettura della finestra: ogni catena è incompleta (§18.6) */
  readonly windowIncomplete: boolean;
  /** Errori osservati ed esaminati, come dichiarati per ultimi da uno step; assente se nessuno step li enumera */
  readonly observedErrors?: ObservedErrors;
  /** Nodi dell'albero degli errori, padri prima dei figli; assente per un runbook di finestra */
  readonly tree?: ReadonlyArray<ErrorTreeNode>;
  /** Contesto finale di ogni nodo, per id; assente per un runbook di finestra */
  readonly nodeContexts?: ReadonlyMap<string, RunbookContext>;
  /** Catene dell'albero, raggruppate, in ordine di tempo; assente per un runbook di finestra */
  readonly chains?: ReadonlyArray<TreeChainGroup>;
  /** Durata totale in millisecondi */
  readonly durationMs: number;
  /** Numero di step eseguiti */
  readonly stepsExecuted: number;
  /** Contesto finale con tutte le variabili e i risultati degli step */
  readonly finalContext: RunbookContext;
  /** Errori recuperati tramite continueOnFailure */
  readonly recoveredErrors: ReadonlyArray<ErrorRecoveryInfo>;
  /** Trace strutturato dell'intera esecuzione */
  readonly trace: RunbookExecutionTrace;
}

/** Una StepCoverage raccolta dal motore, con lo step che l'ha dichiarata. */
interface CoverageEntry extends StepCoverage {
  readonly stepId: string;
}
```

- **`status: 'completed'`** anche quando uno step fallisce dopo che un'altra lettura (`kind: 'data'`) è riuscita: le
  rilevazioni restano e il fallimento è una voce `coverage` con `reason: 'unavailable'`. È `'failed'` solo se lo step
  fallisce prima di aver letto evidenza; in quel caso non si valutano i casi e `detections` è vuoto.
- **`coverage`** contiene solo le fonti incomplete; vuoto significa evidenza completa.
- **`observedErrors`** non rende l'evidenza incompleta: dice quanti errori il runbook ha visto e quanti ne ha seguiti.
  Con l'albero degli errori viene dall'enumeratore della radice ed esamina tutti gli errori.
- **`tree`, `nodeContexts`, `chains`** ci sono solo per un runbook con albero degli errori e un'esecuzione `completed`
  (§19.11).

#### Copertura di CloudWatch Logs

`executeCloudWatchLogsQuery` del toolkit comune (`toolkits/common/steps/aws/cloudwatch-logs/`) chiede a go-aws i
risultati parziali (`partialResults`) e restituisce la copertura di ogni lettura:

- **satura** (`saturated`): una query fisica ha restituito almeno tante righe quanto il suo `limit` (l'ultimo
  `| limit N` della query, 10000 se non ce n'è), oppure ha lasciato pagine non lette per budget
  (`unreadPages: 'budget'`);
- **non disponibile** (`unavailable`): le pagine non si sono potute leggere (`unreadPages: 'failed'`), oppure la
  lettura di un log group è fallita (`failedReads` del risultato di go-aws);
- la fonte è il nome del log group, mai un ARN o un profilo;
- se **tutte** le letture falliscono, l'errore viene rilanciato e lo step fallisce.

`executeCloudWatchLogsQuery` passa da sé il segnale d'annullamento del contesto alla lettura. Due helper di
`toolkits/common` danno a ogni step la stessa regola per le letture che possono fallire:

- `tryCloudWatchLogsRead`: una lettura che, se fallisce, restituisce nessuna riga e una voce `unavailable` (con gli
  identificatori della lettura, se ne ha) invece di far fallire lo step;
- `readCloudWatchLogsBatches`: una query per lotto di elementi (request id, invocazioni); un lotto fallito diventa
  `unavailable` per i suoi identificatori e gli altri tengono le righe, le lacune di un lotto che ha risposto nominano
  i suoi identificatori, e se nessun lotto risponde si rilancia l'errore del primo fallimento.

In entrambi l'annullamento e gli errori di configurazione del target (`OAM_REGION_MISMATCH`, `INVALID_OAM_TARGET`) si
rilanciano sempre: fermano lo step invece di diventare una lettura `unavailable`.

Lato go-aws (`@pagopa/go-aws/cloudwatch-logs/insights`): con l'opzione `partialResults` una lettura fallita o
troncata non scarta quanto già letto. `AWSCloudWatchLogsQueryExecution` riporta `rowsReturned?` e `unreadPages?`
(`'budget' | 'failed'`), e `AWSCloudWatchLogsQueryResult.failedReads?` elenca `{ logGroups, error }` delle letture
fallite dopo aver provato ogni profilo o account candidato. L'annullamento e gli errori di configurazione del target
lanciano comunque; senza `partialResults` il comportamento resta quello delle eccezioni.

---

### 11.4 Esempio Concreto: Trace JSON

Questo esempio mostra il trace prodotto dall'esecuzione del runbook **API Gateway 5xx Alarm Resolution** nello
**Scenario A** (§9): un errore `500` con `RATE_LIMIT`. La pipeline arriva fino allo step `end-investigation`; alla
fine corrispondono `rate-limiting` e `internal-error`, e il primo sostituisce il secondo.

```json
{
  "schemaVersion": "3.0.0",
  "execution": {
    "executionId": "exec-v7-rate-limit",
    "runbookId": "alarm-api-gw-5xx",
    "runbookName": "API Gateway 5xx Alarm Resolution",
    "runbookVersion": "3.0.0",
    "runbookType": "alarm-resolution",
    "startedAt": "2026-02-16T10:30:00.000Z",
    "completedAt": "2026-02-16T10:30:02.100Z",
    "durationMs": 2100,
    "status": "completed",
    "environment": {
      "awsProfiles": ["<profile>"],
      "region": "eu-south-1",
      "invokedBy": "alarm"
    }
  },
  "input": {
    "alarmName": "pn-address-book-io-IO-ApiGwAlarm",
    "alarmStartTime": "2026-02-16T10:15:00Z",
    "alarmEndTime": "2026-02-16T10:30:00Z"
  },
  "pipeline": [
    {
      "executionOrder": 1,
      "stepId": "query-5xx-errors",
      "label": "Cerca errori 5xx nei log di API Gateway",
      "kind": "data",
      "reachedVia": "sequential",
      "startedAt": "2026-02-16T10:30:00.012Z",
      "completedAt": "2026-02-16T10:30:01.845Z",
      "durationMs": 1833,
      "status": "success",
      "recovered": false,
      "input": {
        "logGroups": ["/aws/apigateway/pn-address-book-io"],
        "query": "fields @timestamp, @message, status, traceId, errorCode, latency | filter status >= 500 | sort @timestamp desc | limit 50",
        "startTime": "2026-02-16T10:15:00Z",
        "endTime": "2026-02-16T10:30:00Z"
      },
      "output": [
        {
          "@timestamp": "2026-02-16T10:28:33Z",
          "status": "500",
          "traceId": "1-xyz-abc",
          "errorCode": "RATE_LIMIT"
        }
      ],
      "varsWritten": {},
      "flowDirective": "continue"
    },
    {
      "executionOrder": 5,
      "stepId": "extract-error-code",
      "label": "Estrai codice errore dal messaggio",
      "kind": "transform",
      "reachedVia": "sequential",
      "startedAt": "2026-02-16T10:30:01.851Z",
      "completedAt": "2026-02-16T10:30:01.852Z",
      "durationMs": 1,
      "status": "success",
      "recovered": false,
      "input": { "pattern": "\"errorCode\":\\s*\"([A-Z_]+)\"", "group": 1 },
      "output": "RATE_LIMIT",
      "varsWritten": { "errorCode": "RATE_LIMIT" },
      "flowDirective": "continue"
    },
    {
      "executionOrder": 8,
      "stepId": "set-diagnosis",
      "label": "Imposta diagnosi",
      "kind": "transform",
      "reachedVia": "sequential",
      "startedAt": "2026-02-16T10:30:01.854Z",
      "completedAt": "2026-02-16T10:30:01.854Z",
      "durationMs": 0,
      "status": "success",
      "recovered": false,
      "input": { "expression": "{{vars.statusCode}} - {{vars.errorCode}}" },
      "output": "500 - RATE_LIMIT",
      "varsWritten": { "diagnosis": "500 - RATE_LIMIT" },
      "flowDirective": "continue"
    },
    {
      "executionOrder": 10,
      "stepId": "end-investigation",
      "label": "Fine indagine",
      "kind": "control",
      "reachedVia": "sequential",
      "startedAt": "2026-02-16T10:30:01.857Z",
      "completedAt": "2026-02-16T10:30:01.857Z",
      "durationMs": 0,
      "status": "success",
      "recovered": false,
      "input": {},
      "varsWritten": {},
      "flowDirective": "stop"
    }
  ],
  "variables": {
    "statusCode": "500",
    "traceId": "1-xyz-abc",
    "errorCode": "RATE_LIMIT",
    "diagnosis": "500 - RATE_LIMIT"
  },
  "caseMatching": {
    "casesEvaluated": 4,
    "evaluations": [
      {
        "caseId": "downstream-timeout",
        "description": "Timeout causato da servizio downstream lento",
        "condition": {
          "type": "and",
          "conditions": [
            { "type": "compare", "ref": "vars.statusCode", "operator": "==", "value": "504" },
            { "type": "exists", "ref": "vars.slowService" }
          ]
        },
        "matched": false,
        "resolvedValues": { "vars.statusCode": "500", "vars.slowService": null }
      },
      {
        "caseId": "rate-limiting",
        "description": "Errore causato da throttling / rate limiting",
        "condition": {
          "type": "pattern",
          "ref": "vars.errorCode",
          "regex": "THROTTL|RATE_LIMIT|TOO_MANY_REQUESTS"
        },
        "matched": true,
        "resolvedValues": { "vars.errorCode": "RATE_LIMIT" },
        "evidenceRows": 0
      },
      {
        "caseId": "internal-error",
        "description": "Errore interno del servizio",
        "condition": { "type": "compare", "ref": "vars.statusCode", "operator": "==", "value": "500" },
        "matched": true,
        "resolvedValues": { "vars.statusCode": "500" },
        "evidenceRows": 0,
        "supersededBy": "rate-limiting"
      },
      {
        "caseId": "alarm-resolved",
        "description": "Nessun errore nei log - allarme probabilmente rientrato",
        "condition": { "type": "compare", "ref": "vars.diagnosis", "operator": "==", "value": "NO_ERRORS_IN_LOGS" },
        "matched": false,
        "resolvedValues": { "vars.diagnosis": "500 - RATE_LIMIT" }
      }
    ],
    "matchedCaseIds": ["rate-limiting"]
  },
  "actionsExecuted": [
    {
      "executed": true,
      "actionType": "notify",
      "actionDetail": {
        "type": "notify",
        "channel": "slack:#go-alerts",
        "template": ":traffic_light: *Rate Limiting su API Gateway*\nErrorCode: `{{vars.errorCode}}`\nAzione: verificare limiti di throttling e scalare se necessario"
      },
      "resolvedMessage": "Rate Limiting su API Gateway. ErrorCode: RATE_LIMIT",
      "status": "success",
      "durationMs": 240
    }
  ],
  "coverage": [],
  "summary": {
    "description": "Runbook \"API Gateway 5xx Alarm Resolution\" completed: identified case \"Errore causato da throttling / rate limiting\"",
    "totalSteps": 10,
    "stepsExecuted": 10,
    "stepsFailed": 0,
    "stepsRecovered": 0,
    "stepsSkipped": 0,
    "outcome": "rate-limiting -> notify"
  }
}
```

La `pipeline` è abbreviata: mostra solo alcuni dei dieci step eseguiti.

**Punti chiave dell'esempio:**

- **Pipeline completa**: nessuno step ferma l'esecuzione perché "ha trovato qualcosa"; solo `end-investigation`
  chiude il percorso con `stop`, e i casi vengono valutati dopo
- **`caseMatching.evaluations`** in ordine di dichiarazione, con tutti i casi valutati
- **`supersededBy: "rate-limiting"`** su `internal-error`: il caso corrispondeva, ma è stato sostituito dal più preciso
- **`matchedCaseIds`** e **`actionsExecuted`**: una rilevazione, una azione
- **Niente `firstSeenAt`**: le condizioni leggono solo variabili scalari, quindi le rilevazioni non hanno tempo né
  righe di evidenza
- **`coverage: []`**: l'evidenza è completa
- **`awsProfiles: ["<profile>"]`**: go-analyze-alarm e go-rta-check salvano la traccia senza i nomi dei profili

---

### 11.5 Output del runbook (`@pagopa/go-runbook/output`)

Il `RunbookOutput` è l'esito sintetico versionato che gli script salvano accanto alla traccia e che Watchtower legge.
La versione corrente è `RUNBOOK_OUTPUT_SCHEMA_VERSION` = `'3.0.0'`.

```typescript
interface RunbookOutput {
  readonly schemaVersion: typeof RUNBOOK_OUTPUT_SCHEMA_VERSION; // '3.0.0'
  readonly generatedAt: string;
  readonly runbook: { readonly id: string; readonly name: string; readonly type: RunbookType /* … */ };
  readonly execution: { readonly executionId: string; readonly status: RunbookExecutionStatus /* … */ };
  readonly input: Readonly<Record<string, string>>;
  readonly outcome: RunbookOutcome;
  /** Le catene d'errore, in ordine di tempo; comuni a ogni esito, vuote se non c'è nulla da riportare */
  readonly chains: ReadonlyArray<ErrorChainGroup>;
  readonly coverage: RunbookCoverageOutput; // { complete, sources: CoverageEntry[], errors?: ObservedErrors }
  /** Bozza d'analisi deterministica; assente se l'esito non porta analisi */
  readonly analysis?: AnalysisDraftV1;
  readonly telemetry?: RunbookTelemetry;
  readonly context: RunbookOutputContext;
}
```

**Esiti** (`outcome.kind`) di un runbook di risoluzione allarmi:

| Esito                | Quando                                                                      | Campi principali                                                                                           |
| -------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `known-case-matched` | almeno una rilevazione                                                      | `detections[]`: `caseId`, `description`, `firstSeenAt?`, `lastSeenAt?`, `evidenceRows`, `resolvedMessage?` |
| `unknown-case`       | nessuna rilevazione, evidenza completa                                      | `casesEvaluated`, `fallbackMessage?`                                                                       |
| `inconclusive`       | nessuna rilevazione, evidenza incompleta (lettura fallita, saltata, satura) | `casesEvaluated`, `fallbackMessage?`                                                                       |
| `failed` / `aborted` | errore tecnico o interruzione                                               | `reason?`, `error?`                                                                                        |

Non esistono più un caso primario né una priorità: `detections` elenca tutti i casi, in ordine di tempo.

**Catene d'errore.** `buildErrorChains(result)` costruisce le `ErrorChainGroup`; `renderErrorChainLines(chains)` le
rende in righe (`10:01 Timeout Lambda authorizer (3 volte, fino alle 10:07)`).

- Un runbook **con albero degli errori** (oggi SEND API Gateway) ha le catene dell'albero, raggruppate dal motore:
  ogni gruppo ha i nodi del membro più vecchio, le interruzioni con il loro conteggio, `routes`, `samples` (al più 10)
  e `members` (§19.11).
- Un runbook **di finestra** ha una catena di un solo nodo (`target: 'window'`) per rilevazione, con il tempo della
  sua evidenza. I runbook Lambda e service seguono ancora un solo errore rappresentativo e dichiarano gli altri in
  `observedErrors`.

**Copertura.** `buildCoverageLines(result)` produce le righe comuni a console e bozza d'analisi, solo come conteggi:
`Non esaminati: K <unità>` quando gli errori osservati superano quelli esaminati, e
`Evidenza incompleta: K fonti (sature N, non disponibili M, …)` quando ci sono fonti incomplete.

**Classificazione.** `classifyRunbookOutcome` produce un `RunbookCheck`: stato `HIT`, `MISS`, `INCONCLUSIVE`,
`NO-DATA`, `CONFIG-ERROR` o `EXECUTION-ERROR`; `matchedCaseIds` nell'ordine di tempo delle rilevazioni;
`incompleteSources` con il numero di fonti incomplete per motivo, assente se l'evidenza è completa.

**Bozza d'analisi.** `buildAnalysisDraft(runbook, result)` compone la bozza dalle direttive `analysis` dei casi
rilevati:

- con **una sola** rilevazione e niente da dire sulla copertura, la bozza è quella del caso;
- altrimenti `conclusionNotes` è un elenco numerato dei casi in ordine di tempo
  (`N. YYYY-MM-DD HH:MM:SS UTC — descrizione: risoluzione`), seguito dalle righe di copertura; `errorDetails` unisce
  i dettagli dei casi nello stesso ordine;
- `proposedStatus` è `COMPLETED` se almeno un caso rilevato è chiudibile; `analysisType` è `IGNORABLE` solo se tutti
  i casi lo sono con lo stesso motivo e gli stessi dettagli;
- risorse, downstream, azioni finali e link sono quelli di default seguiti da quelli dei casi, senza duplicati;
- `fitAnalysisDraft` adatta la bozza ai limiti del contratto d'analisi (`ANALYSIS_DRAFT_BOUNDS`).

Senza rilevazioni, un runbook di risoluzione allarmi produce la bozza `UNKNOWN_CASE_CONTEXT` dei soli default.

**Nomi dei profili.** Prima di scrivere output e traccia su file, `scrubAwsProfileNamesDeep` (`./runtime`) toglie i
nomi dei profili AWS configurati da ogni stringa; un elenco come `awsProfiles` mantiene la lunghezza, con ogni nome
sostituito da `<profile>`.

---

## 12. Principi SOLID Applicati

| Principio                     | Applicazione                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S** - Single Responsibility | Ogni `Step` ha una sola responsabilità. `ConditionEvaluator` valuta solo condizioni. `RunbookEngine` solo orchestra. `RunbookBuilder` solo costruisce e valida. Lo step raccoglie l'evidenza e ne dichiara la copertura, il motore rileva i casi noti. |
| **O** - Open/Closed           | Nuovi step si aggiungono implementando `Step<TOutput>`, senza modificare il motore. Nuove condizioni si aggiungono estendendo il tipo `Condition`. Un caso più preciso si aggiunge con `supersedes`, senza toccare il caso che sostituisce.            |
| **L** - Liskov Substitution   | Tutti gli step sono intercambiabili tramite l'interfaccia `Step`. Qualsiasi `Condition` e valutabile dal `ConditionEvaluator`.                                                                                                                         |
| **I** - Interface Segregation | `Step` ha un'interfaccia minimale (`id`, `label`, `kind`, `execute`). `StepDescriptor` aggiunge solo le opzioni runtime necessarie. I servizi sono separati per tipo.                                                                                  |
| **D** - Dependency Inversion  | Gli step dipendono da `ServiceRegistry` (astrazione), non dai client AWS concreti. Il motore dipende dall'interfaccia `Step`, non dalle implementazioni.                                                                                               |

---

## 13. Struttura del package

Il package è `@pagopa/go-runbook` (`packages/go-runbook`). È diviso in quattro strati, ognuno con il proprio entrypoint.

| Entrypoint                            | Cartella                      | Contenuto                                                                                                                    |
| ------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `@pagopa/go-runbook`                  | `src/engine/`                 | Il linguaggio e l'esecuzione di un workflow. Nessuna conoscenza di AWS, prodotti, allarmi o Watchtower.                      |
| `@pagopa/go-runbook/output`           | `src/toolkits/common/output/` | Il contratto dell'output dei runbook verso Watchtower.                                                                       |
| `@pagopa/go-runbook/toolkits/common`  | `src/toolkits/common/`        | Il toolkit operativo comune: servizi, step CloudWatch Logs, famiglie generiche, account logici, policy, helper di test.      |
| `@pagopa/go-runbook/toolkits/send`    | `src/toolkits/send/`          | Pipeline, profili e dati di SEND.                                                                                            |
| `@pagopa/go-runbook/toolkits/interop` | `src/toolkits/interop/`       | Pipeline, profili e dati di INTEROP.                                                                                         |
| `@pagopa/go-runbook/inventory`        | `src/inventory/`              | I runbook concreti e il catalogo.                                                                                            |
| `@pagopa/go-runbook/runtime`          | `src/runtime/`                | La composizione: registro dei servizi, legame all'occorrenza, account AWS, esecuzione. È l'unico strato che usa gli SDK AWS. |

```
packages/go-runbook/src/
  index.ts                  # entrypoint `.`: riesporta engine/
  engine/                   # `.`
    actions/                #   ActionExecutor, factory delle azioni
    builders/               #   RunbookBuilder
    conditions/             #   helper per costruire le condizioni
    context/                #   contesto immutabile e helper
    core/                   #   RunbookEngine, ConditionEvaluator, collectRunbookSteps, assertRequiredServices
    errors/                 #   errori dell'engine (RunbookMissingServicesError, …)
    reporting/              #   RunbookReporter e reporter (console, raccolta, nullo)
    steps/                  #   SetVarStep, executeStep
    tracing/                #   trace dell'esecuzione
    tree/                   #   albero degli errori: ErrorTreeExecutor, catene, livello dei casi
    types/                  #   Step, StepResult, Runbook, KnownCase, Condition, …
    validation/             #   validazione del runbook
  toolkits/
    common/                 # `./toolkits/common` (e `./output`)
      accounts/             #   account AWS logici: selezioni, rubrica, errori
      analysis/             #   bozze di analisi e casi noti (knownCase)
      augmentations/        #   estensioni del modello dell'engine
      builders/             #   AlarmRunbookBuilder, finishAlarmRunbook
      engine/               #   OperationalRunbookEngine, assertAwsAccounts
      families/             #   famiglie generiche: apigw, lambda, service
      output/               #   output dei runbook (entrypoint `./output`)
      parsing/ queries/     #   lettura dei risultati e modelli di query
      policies/             #   policy di esecuzione in cloud
      registration/         #   RunbookCatalog, registrazioni, prodotti, kind
      services/             #   ServiceRegistry, OperationalContext, porte (services/ports/)
      steps/                #   OperationalStep, step CloudWatch Logs
      telemetry/ time/      #   telemetria, finestre temporali delle occorrenze
      testing/              #   createTestServiceRegistry, InMemoryAwsAccountsPort
    send/                   # `./toolkits/send`
      accounts/             #   SEND_ACCOUNTS
      analysis/             #   SEND_DOWNSTREAMS
      families/             #   apigw, downstream, lambda, service
    interop/                # `./toolkits/interop`
      analysis/ applicationLogs/ environment/ helpers/
      families/             #   apigw, k8s
  inventory/                # `./inventory`
    send/                   #   apigw/, downstream/, lambda/, service/, shared/, manifest.ts
    interop/                #   apigw/, k8s/, shared/, manifest.ts
    registry/               #   RUNBOOK_CATALOG, RUNBOOK_REGISTRY
    validation/             #   cataloghi dei downstream per prodotto
  runtime/                  # `./runtime`
    accounts/               #   RuntimeAwsAccountsPort, createAwsAccountsPort
    commands/               #   comandi (export dei descrittori)
    execution/              #   executeRunbookForOccurrence
    services/               #   createServiceRegistry, bindServicesToOccurrence
```

Ogni runbook concreto sta in `inventory/<prodotto>/<famiglia>/<alarm-name>/`, con `runbook.ts` (`buildRunbook()`), `registration.ts` e di solito `knownCases.ts` e `knownServices.ts`. I dati condivisi tra runbook dello stesso prodotto stanno in `inventory/<prodotto>/shared/`.

**Regole di dipendenza** (dependency-cruiser ed ESLint):

- l'engine non importa toolkit, inventory, runtime, né go-aws o le aree di I/O di go-common;
- solo `runtime/` usa gli SDK AWS. Gli altri strati usano solo i contratti senza SDK di go-aws (`./cloudwatch-logs/insights`, `./profiles`) e i tipi della sua root;
- i toolkit non conoscono inventory e runtime; `toolkits/common` non conosce i prodotti;
- toolkit e runtime importano l'engine solo dai suoi barrel: `engine/index.ts`, l'API pubblica (`.`), ed
  `engine/internal.ts`, che nessun `exports` di `package.json` pubblica, con gli helper dell'engine che non sono API
  pubblica (hook della pipeline, identificativi delle letture, valori di correlazione, controlli dei servizi e del
  cablaggio) e `interpolatePlaceholders`, che serve a `./output` senza caricare tutto l'engine;
- SEND e INTEROP non si importano a vicenda, né nei toolkit né nell'inventory;
- un runbook usa l'API pubblica del toolkit del suo prodotto, non i suoi file interni, e non importa le cartelle degli altri runbook (la condivisione passa da `shared/`).

---

## 15. Estensibilita: Creare un Nuovo Step

Per aggiungere un nuovo tipo di step (es. query su S3), basta:

### 1. Creare il file dello step

```typescript
// steps/data/S3QueryStep.ts

import { Step, StepResult, RunbookContext, StepKind } from '../../types';

interface S3QueryConfig {
  readonly id: string;
  readonly label: string;
  readonly bucket: string;
  readonly key: string;
  readonly parseAs: 'json' | 'csv' | 'text';
}

/**
 * Step per leggere un oggetto da S3 e parsarlo.
 */
class S3QueryStep implements Step<unknown> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  constructor(private readonly config: S3QueryConfig) {
    this.id = config.id;
    this.label = config.label;
  }

  async execute(context: RunbookContext): Promise<StepResult<unknown>> {
    const s3 = context.services.s3; // Aggiunto al ServiceRegistry
    const data = await s3.getObject(this.config.bucket, this.config.key);
    const parsed = this.parse(data, this.config.parseAs);
    return { success: true, output: parsed };
  }

  private parse(data: string, format: 'json' | 'csv' | 'text'): unknown {
    switch (format) {
      case 'json':
        return JSON.parse(data);
      case 'csv':
        return parseCsv(data);
      case 'text':
        return data;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}

/** Factory function */
function queryS3(config: S3QueryConfig): S3QueryStep {
  return new S3QueryStep(config);
}

export { S3QueryStep, queryS3 };
export type { S3QueryConfig };
```

### 2. Esportare dalla public API

```typescript
// index.ts
export { S3QueryStep, queryS3 } from './steps/data/S3QueryStep';
```

### 3. Usare nel runbook

```typescript
.step(
  queryS3({
    id: 'read-config-from-s3',
    label: 'Leggi configurazione da S3',
    bucket: 'pn-configs',
    key: 'alarm-thresholds.json',
    parseAs: 'json',
  }),
)
```

Nessuna modifica al motore, ai builder o ad altri step. **Open/Closed in pratica.**

---

## 16. Riepilogo Vantaggi dell'Architettura

| Caratteristica            | Come viene realizzata                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flessibilita**          | Step componibili come mattoncini. Qualsiasi combinazione e possibile.                                                                                         |
| **Estensibilita**         | Nuovo step = nuova classe che implementa `Step<T>`. Nessuna modifica al motore.                                                                               |
| **Rilevazioni multiple**  | Ogni caso noto che corrisponde è riportato, in ordine di tempo; `supersedes` toglie i casi meno precisi dello stesso errore.                                  |
| **Type safety**           | Generics su `Step<TOutput>` e `StepResult<TOutput>`. Contesto tipizzato. `StepDescriptor` per opzioni runtime.                                                |
| **Immutabilita**          | Contesto mai mutato. Ogni step produce un nuovo stato.                                                                                                        |
| **Testabilita**           | `ServiceRegistry` iniettato -> facile mocking. Step testabili isolatamente.                                                                                   |
| **Leggibilita**           | Builder fluent per definire runbook. Factory functions per gli step.                                                                                          |
| **Domain-specific**       | Step e azioni pensati per operazioni reali (CloudWatch, notifiche).                                                                                           |
| **Resilienza**            | `continueOnFailure` per step non critici. Uno step che fallisce dopo una lettura riuscita lascia l'evidenza raccolta e una fonte `unavailable`.               |
| **Sicurezza**             | Validazione statica nel builder. Protezione anti-loop a runtime.                                                                                              |
| **Separazione interessi** | Lo step raccoglie l'evidenza e ne dichiara la copertura (conosce il suo dominio), il motore valuta i casi noti (conosce le regole).                           |
| **Onestà dell'evidenza**  | Query sature, letture fallite o saltate ed errori non esaminati finiscono nella copertura: senza rilevazioni ed evidenza incompleta l'esito è `inconclusive`. |

---

## 17. Validazione, Resilienza e Anti-loop

Questa sezione documenta nel dettaglio validazione nel builder, continueOnFailure e protezione anti-loop.

### 17.1 Validazione nel Builder

La validazione viene eseguita automaticamente da `build()` e può essere invocata manualmente con `validate()`.

#### RunbookValidationError

````typescript
/**
 * Errore di validazione del runbook.
 * Contiene tutti gli errori trovati, con codice, messaggio e riferimenti
 * agli step/casi coinvolti.
 *
 * @example
 * ```typescript
 * try {
 *   const runbook = RunbookBuilder.create('test')
 *     .metadata({ ... })
 *     .step(setVar({ id: 'step-a', ... }))
 *     .step(setVar({ id: 'step-a', ... })) // ID duplicato!
 *     .fallback(logAction({ ... }))
 *     .build();
 * } catch (error: unknown) {
 *   if (error instanceof RunbookValidationError) {
 *     for (const entry of error.errors) {
 *       console.error(`[${entry.code}] ${entry.message}`);
 *     }
 *   }
 * }
 * ```
 */
class RunbookValidationError extends Error {
  constructor(
    readonly runbookId: string,
    readonly errors: readonly ValidationErrorEntry[],
  ) {
    const errorList = errors.map((e, i) => `  ${i + 1}. [${e.code}] ${e.message}`).join('\n');
    super(`Validazione fallita per runbook "${runbookId}" (${errors.length} errori):\n${errorList}`);
    this.name = 'RunbookValidationError';
  }
}
````

#### Logica di validazione completa

I controlli eseguiti sono:

1. **MISSING_METADATA**: metadati non impostati
2. **MISSING_FALLBACK**: azione di fallback non impostata
3. **EMPTY_STEPS**: nessuno step definito
4. **DUPLICATE_STEP_ID**: due o più step con lo stesso ID
5. **DUPLICATE_CASE_ID**: due o più KnownCase con lo stesso ID
6. **UNKNOWN_SUPERSEDED_CASE**: un `supersedes` nomina un id che non è un caso del runbook
7. **SUPERSEDES_CYCLE**: un caso sostituisce se stesso, o le sostituzioni formano un ciclo
8. **UNWIRED_CASE_STEP_REF**: un caso legge uno step che il runbook non esegue (livelli dell'albero compresi)
9. **INVALID_ERROR_TREE**: la forma dell'albero degli errori non è valida (§19.10)
10. **UNANCHORED_ROW_PREDICATES**: un `all(...)` legge due volte le righe della stessa lettura di livello senza righe
    sorelle o di contesto (§19.10)

### 17.2 continueOnFailure per Step

Il flag `continueOnFailure` permette di contrassegnare step non critici: se falliscono, l'errore viene registrato nel contesto ma l'esecuzione prosegue allo step successivo.

Il recupero si decide in un punto solo, `executeSteps`, e vale allo stesso modo per uno step che lancia un'eccezione e per
uno che restituisce `success: false` (come fanno gli step che passano da `executeStep`): in entrambi i casi l'errore
entra in `recoveredErrors`, la traccia segna lo step `recovered` e il ledger registra la lettura `unavailable`.
`executeStepDescriptor` converte soltanto l'eccezione in un risultato fallito. Un annullamento non è mai un fallimento:
`executeStep` e il motore lo rilanciano e l'esecuzione finisce `aborted`.

#### Interfacce aggiornate

```typescript
/**
 * Descrittore di uno step con opzioni di esecuzione.
 */
interface StepDescriptor<TOutput = unknown> {
  /** Lo step da eseguire */
  readonly step: Step<TOutput>;
  /**
   * Se true, un fallimento dello step (eccezione o success=false) non interrompe
   * l'esecuzione: l'errore viene registrato in context.recoveredErrors.
   */
  readonly continueOnFailure?: boolean;
}

/**
 * Informazioni di recovery per step falliti con continueOnFailure attivo.
 */
interface ErrorRecoveryInfo {
  /** ID dello step che ha generato l'errore */
  readonly stepId: string;
  /** Messaggio di errore originale */
  readonly originalError: string;
  /** Timestamp del fallimento */
  readonly failedAt: Date;
}
```

### 17.3 Protezione anti-loop

Il motore include un meccanismo di protezione contro i loop infiniti:

1. **maxIterations**: contatore che limita il numero totale di iterazioni del ciclo while principale

#### RunbookMaxIterationsError

```typescript
/**
 * Errore lanciato quando il numero massimo di iterazioni viene superato.
 * Include informazioni diagnostiche per identificare la causa del loop.
 */
class RunbookMaxIterationsError extends Error {
  constructor(
    /** ID del runbook che ha causato l'errore */
    readonly runbookId: string,
    /** Limite di iterazioni configurato */
    readonly maxIterations: number,
    /** ID dell'ultimo step eseguito prima del superamento */
    readonly lastStepId: string,
    /** Sequenza degli step visitati (utile per diagnostica) */
    readonly visitedSequence: readonly string[],
  ) {
    super(
      `Runbook "${runbookId}" ha superato il limite di ${maxIterations} iterazioni. ` +
        `Ultimo step: "${lastStepId}". Possibile loop infinito rilevato. ` +
        `Ultimi step visitati: [${visitedSequence.slice(-10).join(' -> ')}]`,
    );
    this.name = 'RunbookMaxIterationsError';
  }
}
```

---

## 18. Rilevazioni Multiple ed Evidenza Parziale

Questa sezione spiega perché il motore riporta tutti i casi noti e come uno step dichiara l'evidenza che non ha visto.

### 18.1 Il Problema

Nella finestra di un allarme possono esserci più errori diversi: un timeout dell'authorizer alle 10:01, un 404 di un
downstream alle 10:05. Un motore che si ferma al primo caso riconosciuto, o che sceglie un solo caso "vincente" per
priorità, nasconde gli altri: l'analisi racconta un errore solo e l'operatore non sa che ce n'erano altri.

Allo stesso modo, una query satura o una lettura fallita non devono sembrare un "nessun errore": un runbook che non ha
visto tutto lo deve dire.

### 18.2 La Soluzione: rilevazioni, `supersedes` e copertura

- **Nessuna risoluzione anticipata.** `FlowDirective` è `'continue' | 'stop'`: il motore esegue la pipeline
  e poi valuta **tutti** i casi noti (§5.3). `stop` chiude un percorso, non dichiara un caso.
- **Tutte le rilevazioni, in ordine di tempo.** `RunbookExecutionResult.detections` elenca ogni caso che corrisponde,
  ordinato per `firstSeenAt`; il motore esegue l'azione di ciascuno.
- **`supersedes` al posto della priorità.** Quando due casi spiegano lo stesso errore, il più preciso dichiara i casi
  che sostituisce; il builder rifiuta id inesistenti e cicli (§2.6, §17.1).
- **Copertura.** Uno step dichiara in `StepResult.coverage` le fonti incomplete e in `StepResult.observedErrors` gli
  errori osservati ma non esaminati (§2.3). Uno step che fallisce dopo una lettura riuscita diventa una fonte
  `unavailable` e l'esecuzione resta `completed` (§5.2).
- **Esito `inconclusive`.** Nessuna rilevazione con copertura incompleta non è un `unknown-case`: l'output lo
  classifica come `inconclusive` (§11.5).

### 18.3 Esempio di Step che dichiara la copertura

```typescript
/**
 * Step che legge i log di un servizio per un trace id.
 * Quando la lettura è satura o non ha un identificativo da cercare, lo dichiara nella copertura.
 */
class QueryServiceLogsStep implements Step<ServiceLogsAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  constructor(private readonly config: QueryServiceLogsConfig) {
    this.id = config.id;
    this.label = config.label;
  }

  async execute(context: RunbookContext): Promise<StepResult<ServiceLogsAnalysis>> {
    const traceId = context.vars.get('traceId');
    if (traceId === undefined) {
      // Nessun identificativo: la lettura non è stata tentata
      return {
        success: true,
        output: EMPTY_ANALYSIS,
        coverage: [{ source: this.config.logGroup, complete: false, reason: 'skipped' }],
      };
    }

    const { rows, coverage } = await executeCloudWatchLogsQuery(/* … */);
    const analysis = this.analyzeLogs(rows);

    // L'output resta evidenza per i casi noti; la copertura arriva dalla lettura (satura, non disponibile)
    return {
      success: true,
      output: analysis,
      vars: { errorMessage: analysis.errorMessage },
      ...(coverage.length > 0 ? { coverage } : {}),
    };
  }

  private analyzeLogs(rows: readonly ResultField[][]): ServiceLogsAnalysis {
    // ... logica di analisi ...
  }
}
```

### 18.4 Cosa vede chi legge il risultato

| Elemento                       | Dove                                                | Contenuto                                                                                                |
| ------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Rilevazioni                    | `RunbookExecutionResult.detections`                 | caso, `firstSeenAt`/`lastSeenAt`, `evidenceRows`, `observations`                                         |
| Casi valutati e sostituiti     | `trace.caseMatching.evaluations`                    | ogni caso, in ordine di dichiarazione, con `supersededBy` se sostituito                                  |
| Azioni                         | `trace.actionsExecuted`                             | una per rilevazione, nello stesso ordine (o il fallback); con l'albero una per caso e gruppo di catene   |
| Fonti incomplete               | `RunbookExecutionResult.coverage`, `trace.coverage` | `stepId`, `source`, `reason`, `detail`, `identifiers`                                                    |
| Errori non esaminati           | `RunbookExecutionResult.observedErrors`             | `unit`, `observed`, `examined`, `lowerBound`                                                             |
| Catene e copertura nell'output | `RunbookOutput.chains`, `RunbookOutput.coverage`    | i gruppi di catene dell'albero, o una catena di un nodo per rilevazione; `complete`, `sources`, `errors` |

### 18.5 Quando dichiarare copertura ed errori osservati

| Tipo di step                              | Cosa dichiara                                                                                                       | Motivazione                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Data steps** (`kind: 'data'`)           | `coverage` quando la lettura è satura, fallita o saltata                                                            | Solo chi legge sa se ha visto tutto                          |
| **Transform steps** (`kind: 'transform'`) | `coverage` con `skipped` quando scarta elementi                                                                     | Un elemento scartato non è un elemento assente               |
| **Step che enumerano gli errori**         | `observedErrors` quando seguono un solo errore rappresentativo; con l'albero lo dichiara l'enumeratore della radice | L'operatore deve sapere quanti errori non sono stati seguiti |
| **Correlazioni manuali**                  | `coverage` con `manual`                                                                                             | La correlazione richiede una persona                         |
| **Control / Check / Mutation steps**      | Di norma niente                                                                                                     | Non leggono evidenza                                         |

### 18.6 Stato delle letture: il read ledger

Un'esecuzione ha un `ReadLedger`, creato da `execute`: registra le lacune delle letture e risponde allo stato di una
lettura, di una discesa, di un livello per un nodo, di un nodo e della finestra.

- **Stati.** `ReadState` è `queried` (completa) < `saturated` < `unavailable` < `skipped` < `cycle`; una lettura con più
  lacune ha lo stato della più grave. `cycle` lo producono solo le discese e non diventa mai una voce di copertura.
- **Dal motivo allo stato.** `saturated` → `saturated`; `unavailable`, `manual`, motivo assente e lettura fallita →
  `unavailable`; `skipped` → `skipped`. La stessa regola vale per gli step e per i livelli dell'albero.
- **Lacune per identificativo.** Una voce con `identifiers` riguarda solo quegli identificativi; senza, o con una lista
  vuota, tutta la lettura. Un `requestId` segue la regola unica dei request id (`isRequestId`), gli altri tipi quella
  della correlazione dei nodi; un identificativo non valido rende la lacuna di tutta la lettura. Oggi le dichiara
  `QueryApiGwExecutionLogsStep`, per i request id di un lotto che non ha letto tutto mentre un altro lotto ha risposto.
- **Vista sul contesto.** `context.reads` è in sola lettura: `stateOf(stepId)` è lo stato della lettura di uno step;
  `stateOf(stepId, identifier)` conta solo le lacune che nominano l'identificativo e quelle di tutta la lettura;
  `hasGapFor(stepId, identifier)` dice se una lacuna nomina l'identificativo; `isComplete(stepId)` se la lettura non ha
  lacune.
- **Scope.** La finestra, ogni nodo e ogni pseudo-nodo d'instradamento (§19.5) hanno uno scope; uno scope vede le
  lacune proprie e quelle degli scope da cui discende. Una lacuna vale per ogni scope che la dichiara o la riusa: due
  nodi che riusano una lettura condivisa sono entrambi incompleti. Un nodo è incompleto anche quando una lacuna di uno
  scope superiore nomina un identificativo della sua correlazione.
- **Voci esposte.** `result.coverage` e `trace.coverage` hanno ogni voce una volta per step e oggetto: la stessa voce
  riusata da più nodi compare una volta, due letture danno sempre due voci. Una lettura nuova restituisce voci nuove.
- **Finestra incompleta.** `RunbookExecutionResult.windowIncomplete` è vero con una lacuna senza identificativi nello
  scope della finestra. Senza albero una rilevazione è incompleta se la finestra lo è, se una lacuna nomina un
  identificativo che ha osservato, o se non ha osservazioni utilizzabili (dello stesso tipo delle lacune e valide)
  mentre esiste una lacuna per identificativo. `coverage.complete` dell'output resta calcolato su tutte le voci.

---

## 19. Albero degli errori

Un runbook "di finestra" esegue i suoi step una volta e valuta i casi noti sul contesto finale. Quando la finestra
contiene molti errori, e ognuno va seguito nei servizi che attraversa, il runbook dichiara un **albero degli errori**
con `RunbookBuilder.errorTree(...)`: ogni errore diventa un **nodo** con il suo contesto, i suoi step e i suoi casi.
Oggi lo usa la famiglia SEND API Gateway (§19.12).

### 19.1 Livelli

`ErrorTreeDefinition` ha un livello radice (`root`) e i livelli in cui si può scendere (`levels`). Un `TreeLevel` è:

| Campo           | Cosa fa                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`        | Nome del livello (`api-gateway`, `pn-delivery`): è il bersaglio delle discese                                                                                        |
| `read`          | La **lettura** del livello (`TreeLevelReader`): una query per un lotto di identificativi dello stesso tipo, in `OR`. Assente per la radice                           |
| `attribute`     | Per un identificativo, il test delle righe della lettura raggruppata che gli appartengono: costruito una volta per identificativo del lotto; obbligatorio con `read` |
| `batchSize`     | Identificativi per lettura (default 50)                                                                                                                              |
| `rowIdentity`   | Identità di una riga (`@ptr`, oppure tutti i campi): unisce due tentativi ed esclude le righe degli antenati                                                         |
| `secondAttempt` | Secondo tentativo sullo stesso livello con un identificativo migliore trovato dal primo (§19.4)                                                                      |
| `enumerate`     | L'**enumeratore**: divide le righe lette in nodi d'errore (`ErrorNodeSpec`) e, se servono, in uno pseudo-nodo `routing` (§19.5)                                      |
| `perNode`       | Step eseguiti nel contesto di ogni nodo; decidono le sue discese                                                                                                     |
| `afterDescend`  | Step eseguiti su ogni nodo quando le sue discese sono concluse, con le variabili pubblicate dai figli                                                                |
| `varPrefix`     | Prefisso delle variabili che una discesa pubblica sul padre (§19.3)                                                                                                  |
| `exclusions`    | Diagnosi che un caso del padre può chiedere assenti dalla lettura di questo livello (§19.8)                                                                          |
| `scopedSteps`   | Solo radice: gli step della finestra le cui righe si dividono fra i nodi (per esempio l'access log)                                                                  |
| `ownsVar`       | Le variabili scritte dai nodi del livello: un caso che le legge appartiene a questo livello (§19.9)                                                                  |

La radice legge la finestra con gli step ordinari del runbook e la enumera dal contesto: ogni errore della finestra è
un nodo, e l'enumeratore dichiara `observedErrors` con tutti gli errori esaminati. Ogni altro livello legge, per i suoi
padri, gli identificativi con cui sono scesi.

Una lettura non è uno step: il motore chiama solo `read`, mentre id, etichetta e tipo la nominano nella traccia e i
servizi che dichiara (`requiredServices`) sono controllati con quelli degli step prima del primo step. Le letture di
CloudWatch Logs dei toolkit estendono `CloudWatchLogsLevelReader` (`toolkits/common`), che esegue la query del lotto
nei profili configurati e passa al motore copertura e diagnostica; la sottoclasse dà log group, query, righe del lotto
e riga del racconto.

```typescript
import type { DescendRequest, RunbookContext, Step, StepKind, StepResult, TreeLevel } from '@pagopa/go-runbook';

/** Step di nodo: dice dove cercare gli errori della stessa operazione un livello più sotto. */
class DescendToDeliveryStep implements Step<void> {
  readonly id = 'descend-to-delivery';
  readonly label = 'Discesa verso pn-delivery';
  readonly kind: StepKind = 'control';

  async execute(context: RunbookContext): Promise<StepResult<void>> {
    // Un identificativo vuoto chiede comunque la discesa: la catena si interrompe come `skipped`.
    const descend: DescendRequest = {
      target: 'pn-delivery',
      identifier: { kind: 'traceId', value: context.vars.get('traceId') ?? '' },
    };
    return { success: true, descend: [descend] };
  }
}

const delivery: TreeLevel = {
  target: 'pn-delivery',
  varPrefix: 'delivery',
  read: deliveryLogsReader, // TreeLevelReader con id 'query-pn-delivery'
  attribute: (identifier) => (row) => traceIdOf(row) === identifier.value,
  rowIdentity: (row) => pointerOf(row),
  enumerate: ({ rows }) => ({
    nodes: rows.filter(isErrorRow).map((row, index) => ({
      key: `e${String(index + 1)}`,
      label: firstLineOf(row),
      vars: { deliveryErrorMsg: messageOf(row) },
      scopedOutputs: { 'query-pn-delivery': [row] },
      siblingOutputs: { 'query-pn-delivery': rows.filter((other) => other !== row && isErrorRow(other)) },
      contextOutputs: { 'query-pn-delivery': rows.filter((other) => !isErrorRow(other)) },
    })),
  }),
  ownsVar: (name) => name === 'deliveryErrorMsg',
};

builder.errorTree({
  root: {
    target: 'api-gateway',
    scopedSteps: ['query-api-gw-logs'],
    enumerate: enumerateRequests, // un nodo per richiesta in errore
    perNode: [{ step: new DescendToDeliveryStep() }],
  },
  levels: [delivery],
});
```

`deliveryLogsReader`, `traceIdOf`, `pointerOf`, `isErrorRow`, `messageOf`, `firstLineOf` ed `enumerateRequests` sono
segnaposto dell'esempio. La famiglia SEND API Gateway ha i suoi (§19.12).

### 19.2 Contesto isolato del nodo

Ogni nodo ha un contesto suo, copiato da quello del padre (o della finestra per un nodo radice):

- **variabili degli antenati sì**: il nodo legge le variabili del padre e dei nodi sopra di lui, più le proprie
  (`ErrorNodeSpec.vars`);
- **righe degli antenati no**: gli step del livello del padre spariscono dal contesto; per gli step che il nodo
  delimita (`scopedOutputs`) `steps.<id>` restituisce solo le sue righe d'errore;
- quello che scrivono gli step del nodo resta nel nodo; la copertura che dichiarano entra nell'esecuzione.

Accanto alle sue righe un nodo può avere le **righe correlate** dello stesso identificativo:

| Riferimento           | Contenuto                                                               |
| --------------------- | ----------------------------------------------------------------------- |
| `steps.<id>`          | le righe d'errore del nodo                                              |
| `steps.<id>.siblings` | le altre righe d'errore dello stesso identificativo (righe **sorelle**) |
| `steps.<id>.context`  | le righe che non sono errori (INFO, successi): righe **di contesto**    |

Un nodo il cui step fallisce ha `status: 'failed'`, non scende, e la sua catena si interrompe lì con quanto ha raccolto.
`stop` chiude gli step del nodo: un nodo fermato prima del suo step di discesa non scende. Il limite di iterazioni vale
per ogni blocco (`perNode` o `afterDescend`) di ogni nodo.

### 19.3 Discese a lotti e variabili pubblicate sul padre

Uno step di nodo chiede le discese con `StepResult.descend` (`DescendRequest`: `target` e `identifier`, un
`EvidenceIdentifier` con `kind` e `value`). Il motore procede per ondate:

1. raccoglie le discese di tutti i nodi non ancora lette;
2. le **raggruppa per livello e tipo d'identificativo** e le legge a lotti: un lettore che sa dividerli
   (`TreeLevelReader.batches`, come `CloudWatchLogsLevelReader`) mette in un lotto quanti identificativi stanno in una
   query di 10.000 caratteri, perché ogni query scansiona tutto il log group della finestra; altrimenti lotti fissi di
   `batchSize` (che per un lettore che divide resta un tetto);
3. **divide** le righe fra i padri per identificativo esatto (`attribute`); una lettura di un solo identificativo le
   assegna tutte;
4. toglie le righe che un antenato possiede già (`rowIdentity`), pubblica sul padre l'esito della lettura e chiama
   l'enumeratore del livello, che crea i figli;
5. ricomincia finché restano discese da leggere.

Un lotto saturo si divide in due e si rilegge (`readSplittingSaturated`), finché le metà sono complete, entro un budget
di 10 riletture per esecuzione condiviso da tutti i lettori (`RunbookContext.readSplits`): le righe di un identificativo
riletto completamente sono quelle delle metà, a un identificativo ancora incompleto restano anche le righe del lotto
saturo, senza doppioni. Si divide solo una lettura che sa riconoscere le proprie righe (`rowIdentity` del lettore); le
letture a lotti degli step (`readCloudWatchLogsBatches`) dichiarano `belongs` e `rowIdentity`. Ogni lettura fallita di
CloudWatch Logs si conta una volta (`RunbookContext.readFailures`, nella traccia `readFailures`) e la telemetria la
riporta accanto alle query (`failedQueryCount`).

La copertura di una lettura raggruppata (satura, non disponibile) vale per tutti gli identificativi del lotto, salvo
le lacune che nominano i loro `identifiers`. Ogni tentativo di una discesa è legato al lotto che l'ha letta: la discesa
ha lo stato peggiore dei suoi tentativi, il livello per un padre il peggiore delle sue discese (§18.6). Ogni padre
riceve l'esito anche senza righe; con un `varPrefix` lo trova nelle sue variabili:

| Variabile                    | Valore                                                     |
| ---------------------------- | ---------------------------------------------------------- |
| `<prefisso>LookupState`      | `queried`, `saturated`, `unavailable`, `skipped` o `cycle` |
| `<prefisso>LogCount`         | righe trovate dall'ultima lettura                          |
| `<prefisso>Exclusion.<nome>` | esito di un'esclusione dichiarata sul livello (§19.8)      |

Le variabili arrivano dopo gli step `perNode` del padre: le leggono i suoi step `afterDescend` e i suoi casi. I nomi si
costruiscono con `lookupStateVar`, `logCountVar` ed `exclusionVar`.

### 19.4 Secondo tentativo

`secondAttempt` riceve le righe del primo tentativo e può restituire un identificativo migliore per lo stesso livello
(per esempio il trace id portato dalle righe trovate per fallback UUID). Il motore rilegge il livello con quello, a
lotti come il primo, e unisce le righe dei due tentativi per identità; lo stato è il peggiore dei due. Non è una
discesa: il padre resta lo stesso.

### 19.5 Instradamento dalle righe di contesto

Le righe che non sono errori possono mostrare una strada che i rami d'errore non coprono (una riga INFO che chiama un
servizio a valle). L'enumeratore le restituisce come pseudo-nodo `routing`: il motore esegue su di esso gli step
`perNode` del livello e aggiunge al **padre** le discese che ne escono, se nessun ramo copre già lo stesso livello e
identificativo. Lo pseudo-nodo non diventa mai un nodo; il figlio trovato da quella discesa porta in `via` i livelli
attraversati senza errori (`via pn-external-registries`).

### 19.6 Anti-ciclo

- Una catena non ripete mai la stessa discesa (`target`, tipo e identificativo): la ripetizione si chiude come `cycle`.
- Oltre 32 livelli di profondità la discesa si chiude come `cycle`.
- Un discendente non enumera mai una riga di un antenato (`rowIdentity`).
- Le discese uguali dello stesso nodo si leggono una volta sola.

### 19.7 Esito del ramo: `branchOutcome`

Concluso l'albero, il motore valuta i nodi **dal più profondo**: gli step `afterDescend`, l'esito del ramo sotto il
nodo, poi i casi noti del suo livello. L'esito del ramo è nella variabile `branchOutcome` (`BRANCH_OUTCOME_VAR`):

| Valore        | Quando                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| `diagnosed`   | un nodo sotto è riconosciuto da un caso                                             |
| `incomplete`  | nessuna diagnosi sotto, e una catena interrotta o un'evidenza incompleta            |
| `undiagnosed` | nessuna diagnosi su un ramo completo, compresa una discesa letta per intero e vuota |

Serve a un caso generico che vale solo se sotto non c'è niente di più preciso:

```typescript
// L'errore del BFF è la diagnosi solo quando il ramo sotto è completo e non riconosce nulla di più specifico.
const BRANCH_UNDIAGNOSED = varEquals(BRANCH_OUTCOME_VAR, 'undiagnosed');
```

### 19.8 Esclusioni

Un'esclusione (`TreeExclusion`: `name`, `condition`) è una diagnosi che un caso del padre chiede **assente** da tutta
la lettura del livello per quel padre. Il motore valuta la condizione su un contesto in cui lo step di lettura
restituisce tutte le righe lette per il padre, e pubblica `<prefisso>Exclusion.<nome>`:

- `present`: la diagnosi c'è;
- `absent`: lettura completa (`queried`) senza la diagnosi;
- `unknown`: lettura incompleta, saltata o fallita.

```typescript
// Il timeout di pn-delivery verso pn-external-registries vale solo se la lettura completa
// di pn-external-registries per quell'errore non ha una diagnosi più specifica.
condition: all(
  stepEvidenceMatches('query-pn-delivery', 'Error during retrieve of the groups[\\s\\S]*Read timed out'),
  varEquals(exclusionVar('externalRegistries', 'specificDiagnosis'), 'absent'),
),
```

### 19.9 Livello di un caso

`computeCaseLevels` decide su quali livelli si valuta ogni caso, dai riferimenti della sua condizione:

- uno step appartiene al livello che lo legge, lo delimita o lo esegue; ogni altro step della finestra alla radice;
- una variabile appartiene al livello che la scrive (`ownsVar`);
- le variabili pubblicate da una discesa (`<prefisso>LookupState`, …) e `branchOutcome` si leggono dove sono
  pubblicate e non decidono il livello;
- un caso che legge più livelli si valuta su ciascuno; un caso che non legge nulla sotto la radice è della radice.

Un caso che legge una variabile di un antenato e le righe del suo livello corrisponde sul nodo più profondo, che vede
entrambe:

```typescript
all(
  varMatches('bffErrorMsg', '500 Internal Server Error from GET http://[^\\s"\\\\]+/ext-registry/pa/v1/groups\\b'),
  stepEvidenceMatches('query-pn-external-registries', '\\[DOWNSTREAM\\] Service SelfcarePA returned errors=400'),
  anyStepEvidenceMatches(
    ['query-pn-external-registries', 'query-pn-external-registries.siblings'],
    'Invalid tenant context',
  ),
);
```

### 19.10 Righe correlate e `UNANCHORED_ROW_PREDICATES`

Ogni riga d'errore di una lettura di livello è un nodo a sé. Due predicati sulle righe della **stessa** lettura dentro
un `all(...)` chiederebbero alla stessa riga di soddisfarli entrambi: una firma divisa su due righe non corrisponde mai.
La firma va ancorata sul nodo con un predicato e cercata nelle righe sorelle o di contesto con l'altro, come
nell'esempio sopra (`[STEP, STEP.siblings]`).

Il builder rifiuta un caso con un `all(...)` che legge due volte le righe della stessa lettura di livello senza
`.siblings` o `.context` (`UNANCHORED_ROW_PREDICATES`). Le esclusioni non hanno questo vincolo: si valutano su tutta la
lettura. Il builder controlla anche la forma dell'albero (`INVALID_ERROR_TREE`): livelli con `target` distinti, una
lettura con attribuzione per ogni livello sotto la radice, `scopedSteps` della finestra, id di step unici.

### 19.11 Catene, gruppi, azioni e fallback

Una **catena** (`TreeChain`) va da un nodo radice fin dove l'indagine si è fermata:

- `leaf`: il nodo non ha chiesto discese, o ogni discesa è una lettura completa senza errori;
- `interrupted`, con il motivo e il livello: `skipped` (identificativo mancante), `unavailable`, `incomplete`
  (lettura satura), `cycle`, `failed` (step del nodo fallito).

Una catena ha `incompleteEvidence` quando la finestra ha una lacuna di tutta la lettura (`windowIncomplete`), quando un
nodo del suo percorso è incompleto o quando una discesa del suo percorso non è `queried`, anche se ha restituito righe.
Le catene usano lo stato della propria discesa: di due discese allo stesso livello, una completa e una fallita, solo
la catena della seconda è incompleta. Le
catene con la stessa sequenza di `(target, casi)`, la stessa fine e lo stesso motivo d'interruzione formano un
**gruppo** (`TreeChainGroup`); i gruppi sono in ordine di tempo, poi di dichiarazione dei casi, quelli senza tempo in
fondo.

- **Rilevazioni**: `detections` raccoglie quelle di tutti i nodi, in ordine di `firstSeenAt`; lo stesso caso compare una
  volta per ogni nodo che lo riconosce.
- **Azioni**: l'azione di ogni caso si esegue **una volta per gruppo**, dal nodo che l'ha riconosciuto nel membro più
  vecchio e con il contesto di quel nodo; un nodo condiviso da due gruppi esegue le sue azioni una volta.
- **Fallback**: solo se nessun nodo è riconosciuto, con il contesto dell'ultimo nodo della catena più vecchia.
- **Risultato**: `RunbookExecutionResult` aggiunge `tree` (i nodi, padri prima dei figli), `nodeContexts` (il contesto
  finale di ogni nodo) e `chains` (§11.3). Le letture dei livelli compaiono nella traccia come step.
- **Output**: `buildErrorChains` trasforma i gruppi in `ErrorChainGroup` con i nodi del membro più vecchio, le
  interruzioni contate, `routes` (le strade `via`, con quante catene le hanno prese), `samples` (al più 10 chiavi con la
  correlazione) e `members` (tutte le catene). L'evidenza dichiarata si raccoglie per nodo, con il campo `node`
  (`<request-id> > e1`).

**Letture condivise.** `RunbookContext.sharedReads` è una mappa, creata da ogni esecuzione, per le letture della
finestra che uno step fa una volta per tutta l'esecuzione: il primo nodo che ne ha bisogno la avvia e la registra con
una chiave, gli altri ricevono la stessa promessa. Solo il primo dichiara la copertura.

```typescript
const key = `window-read:${this.id}`;
const shared = context.sharedReads?.get(key) as Promise<StepResult<Rows>> | undefined;
if (shared !== undefined) {
  const { coverage: _declared, ...result } = await shared;
  return result;
}
const read = this.probe(context);
context.sharedReads?.set(key, read);
return read;
```

### 19.12 Famiglia SEND API Gateway

`createSendApiGwAlarmRunbook` (`@pagopa/go-runbook/toolkits/send`, `apigw`) costruisce un runbook ad albero: indaga
**ogni** richiesta in errore e **ogni** errore dei servizi attraversati.

**Finestra.** Gli step ordinari leggono:

1. l'access log API Gateway (`query-api-gw-logs`), filtrato per stato;
2. se attivo, l'execution log (`query-api-gw-execution-logs`) di **ogni** richiesta in errore con request id, a lotti
   (`executionLogMaxRequestIds`, default del profilo SEND: 50).

**Radice (`api-gateway`).** Un nodo per richiesta in errore, con chiave il request id (una riga senza request id è
una richiesta a sé). Il nodo delimita le sue righe di access log e di execution log ed è etichettato con stato, metodo e
percorso. Per ogni richiesta, in ordine:

| Step o ancora                              | Cosa fa                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `parse-api-gw-errors`                      | estrae trace id e metadati della richiesta                                                        |
| `evaluate-api-gw-authorizer-failure`       | se configurato, gate dell'authorizer: un errore dell'authorizer ferma la richiesta (`stop`)       |
| `stop-api-gw-execution-log-unresolved`     | in modalità `terminal`, ferma la richiesta quando l'execution log è stato letto                   |
| ancora `before-service-traversal`          | hook prima della discesa                                                                          |
| `descend-api-gateway`                      | scende al servizio d'ingresso                                                                     |
| ancora `after-entry-read` (`afterDescend`) | hook dopo la lettura del servizio d'ingresso: `<prefisso>LookupState` e `<prefisso>LogCount` noti |

**Un livello per servizio.** Ogni servizio del runbook (`entryService` e `services`) è un livello con
`target` = nome del servizio e `varPrefix` del servizio:

- la lettura (`ServiceLogsLevelReader`, step `query-<servizio>`) è una query per lotto di trace id o di fallback UUID
  in `OR`; la query deve contenere `{{FILTER_CLAUSE}}`;
- l'attribuzione legge il campo trace id (il messaggio solo se il campo manca, e solo un trace scritto come token
  intero) o il token esatto del fallback UUID; il lettore tiene le stesse righe, quindi un lotto di un solo
  identificatore dà al nodo le righe che l'attribuzione gli darebbe in un lotto più grande;
- l'enumeratore fa un nodo per riga d'errore (livello ERROR o WARN, o parola chiave d'errore in una riga senza
  livello), con `<prefisso>ErrorMsg`, `<prefisso>NextUrl` e `<prefisso>NextUrlTarget`; le altre righe d'errore sono
  sorelle, le righe non d'errore di contesto e, se chiamano un URL noto, lo pseudo-nodo `routing`;
- il secondo tentativo rilegge per trace id un servizio letto per fallback UUID;
- lo step `descend-<servizio>` scende al servizio dell'URL noto chiamato dalla riga, con il fallback UUID della chiamata
  o, senza, con il trace id. Un URL noto fuori dal runbook è un downstream: la catena finisce con `downstreamTarget`.
  Una chiamata allo stesso servizio, o nessun URL noto, chiude la catena;
- sul servizio d'ingresso, prima della discesa, c'è l'ancora `after-entry-analysis`.

**Il trace id.** Le regole stanno in `toolkits/common/parsing/traceIds/`. I formati riconosciuti sono in
`TRACE_ID_FORMATS`, uno per voce: l'X-Ray Trace ID (`1-…`), con la forma compatta a 32 cifre esadecimali che è anche il
Trace ID di W3C; il Fallback UUID di SEND (`FALLBACK-UUID:<uuid>`); il `traceId:<uuid>` dei log applicativi. Ogni formato
dice come si riconosce un valore e qual è la sua forma canonica, in che forme lo cercano le query, quali token lo
nominano in un messaggio e se un messaggio ne dà uno da scoprire (il Fallback UUID no: un messaggio nomina anche quelli
delle chiamate). `canonicalTraceId` dà la forma canonica di un valore di qualunque formato, anche dal `Root=` di un header
X-Ray o da un header `traceparent`; è la forma di correlazioni, variabili `…TraceId` e identificatori delle discese.
`traceIdForms` dà le forme con cui le query lo cercano: quella data e quelle del suo formato. Una query a lotti le
scrive tutte in una sola regex (`traceIdsInsightsPattern`: `@message like /f1|f2|…/`, ogni forma come letterale), che
trova le stesse righe di un `like` per forma in una query molto più corta; il profilo SEND la usa con
`tracePatternTemplate`, un profilo senza il template tiene un predicato per forma (`tracePredicateTemplate`). `traceRowMatcher` dice se una riga appartiene a un trace: decide
il campo trace, il messaggio solo senza campo. Le letture per lotti (template con `@message like '{{TRACE_ID}}'`,
`ServiceLogsLevelReader`) tengono le righe con questa regola; una query che legge un trace per volta scarta solo le
righe il cui campo trace nomina un altro trace (`rowsOfTraces`). Il profilo SEND estrae dall'access log il solo id
(`Root=([^;\s]+)`); un valore che non è un trace id non dà né discesa né correlazione `traceId`.

Ogni ancora (`ApiGwPipelineAnchor`) si usa con `hooks: [{ at: '<ancora>', step }]`:

| Ancora                     | Dove                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `before-service-traversal` | su ogni richiesta, dopo parsing, gate dell'authorizer ed execution log, prima della discesa |
| `after-entry-analysis`     | su ogni errore del servizio d'ingresso, prima della discesa al servizio che chiama          |
| `after-entry-read`         | su ogni richiesta, dopo la lettura del servizio d'ingresso per lei                          |

Per esempio pn-delivery B2B usa `after-entry-read` per leggere gli errori della Lambda di versioning solo quando la
richiesta è un 500 e la lettura di pn-delivery è completa e vuota (`deliveryLookupState = queried`,
`deliveryLogCount = 0`); la lettura è una per tutta l'esecuzione, con `sharedReads`.

**Esclusioni sui servizi.** `ApiGwService.exclusions` dichiara le esclusioni del livello del servizio; il chiamante le
trova come `<prefisso>Exclusion.<nome>` (§19.8).

```typescript
const REACHABLE_SERVICES: ReadonlyArray<apigw.ApiGwService> = [
  {
    name: 'pn-external-registries',
    logGroup: '/aws/ecs/pn-external-registries',
    varPrefix: 'externalRegistries',
    // [{ name: 'specificDiagnosis', condition: any(/* diagnosi più specifiche */) }]
    exclusions: EXTERNAL_REGISTRIES_EXCLUSIONS,
  },
];
```

La console (`renderErrorChainLines`) stampa una riga per gruppo di catene; un nodo non riconosciuto è `? (etichetta in
livello)`, per esempio:

```text
10:01 ? (500 GET /bff/v1/pa/groups in api-gateway) → ? (Errore BFF in pn-bff) → SelfcarePA restituisce 400 Invalid tenant context durante la lettura dei gruppi PA: [DOWNSTREAM] Service SelfcarePA returned errors=400 (3 volte, fino alle 10:07)
```
