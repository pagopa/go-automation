# Runbook Engine - Reference

> **Documentazione di riferimento per il motore di esecuzione runbook**
> Package: `@go-automation/go-runbook-engine`

---

## 1. Panoramica

Il Runbook Engine e un sistema per definire, comporre ed eseguire runbook operativi. Un runbook e una procedura strutturata che:

1. Raccoglie dati da diverse sorgenti (CloudWatch, Athena, DynamoDB, HTTP)
2. Esegue una sequenza di step autonomi, ognuno con input/output tipizzati
3. Supporta branching condizionale per percorsi di esecuzione diversi
4. Supporta **sub-pipeline annidate** per branching complesso inline
5. Permette agli step di **segnalare una risoluzione anticipata** tramite la direttiva `'resolve'`
6. Alla fine dell'esecuzione (o prima, se un segnale `'resolve'` ha successo), confronta il risultato con una lista di **casi noti**
7. Se il risultato corrisponde a un caso noto, esegue l'**azione associata**

### Step Signals e Early Resolution

Il motore supporta un **sistema di segnali** nel `StepResult` che permette agli step di comunicare le proprie scoperte al motore. Quando uno step restituisce `next: 'resolve'`, il motore valuta immediatamente i casi noti:

- **Se un caso noto corrisponde**: la pipeline si interrompe (terminazione anticipata) e si procede all'azione
- **Se nessun caso corrisponde**: l'esecuzione continua normalmente allo step successivo (lo step era ottimista)

Questo approccio e elegante perche:

- Lo **step** decide quando ritiene di aver trovato qualcosa (separazione delle responsabilita: lo step conosce il suo dominio)
- Il **motore** decide se si tratta effettivamente di un caso noto (lo step non ha bisogno di conoscere i casi noti)
- Se il motore non trova un match, l'esecuzione prosegue naturalmente
- Nessuna duplicazione di condizioni

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

Uno **Step** e l'unita atomica di esecuzione. Riceve un contesto immutabile e produce un risultato.

```typescript
/**
 * Interfaccia base per tutti gli step del runbook.
 * Ogni step e un componente autonomo: riceve un contesto, produce un risultato.
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
  /** Se lo step e stato eseguito con successo */
  readonly success: boolean;
  /** Output prodotto dallo step (undefined se success=false) */
  readonly output?: TOutput;
  /** Messaggio di errore (solo se success=false) */
  readonly error?: string;
  /** Variabili da aggiungere/aggiornare nel contesto */
  readonly vars?: Readonly<Record<string, string>>;
  /**
   * Direttiva di flusso: quale step eseguire dopo.
   * Include la direttiva 'resolve' per segnalare una possibile risoluzione anticipata.
   */
  readonly next?: FlowDirective;
  /**
   * Informazioni di recovery se lo step e fallito
   * ma l'esecuzione e continuata grazie a continueOnFailure.
   */
  readonly errorRecovery?: ErrorRecoveryInfo;
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
  /** Indica che lo step e stato saltato e l'esecuzione e continuata */
  readonly skipped: true;
}
```

### 2.4 FlowDirective

Le direttive di flusso controllano quale step eseguire dopo quello corrente.

```typescript
/**
 * Direttive di controllo del flusso di esecuzione.
 * - 'continue': procedi allo step successivo in sequenza
 * - 'stop': termina l'esecuzione del runbook senza valutare i casi noti
 * - 'resolve': segnala che lo step ritiene di aver raccolto dati sufficienti.
 *   Il motore valuta i casi noti: se un caso corrisponde, termina la pipeline;
 *   se nessun caso corrisponde, prosegue allo step successivo.
 * - { goTo: string }: salta allo step con l'id specificato
 */
type FlowDirective = 'continue' | 'stop' | 'resolve' | { readonly goTo: string };
```

### 2.5 RunbookContext

Il contesto e lo stato immutabile condiviso tra tutti gli step. Viene aggiornato (tramite copia) dopo ogni step.

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
  /** Log entries raccolti durante l'esecuzione */
  readonly logs: readonly LogEntry[];
  /** Servizi AWS e HTTP iniettati */
  readonly services: ServiceRegistry;
  /**
   * Errori recuperati da step con continueOnFailure.
   * Permette di ispezionare quali step sono falliti senza bloccare l'esecuzione.
   */
  readonly recoveredErrors: ReadonlyArray<ErrorRecoveryInfo>;
  /** Segnale di abort per cancellare l'esecuzione. Propagato a tutte le chiamate ai servizi. */
  readonly signal?: AbortSignal;
}
```

### 2.6 KnownCase

Un caso noto e un pattern riconoscibile nel risultato finale, con un'azione associata.

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
  /** Priorita: se piu casi matchano, vince quello con priorita piu alta */
  readonly priority: number;
}
```

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
  /** Casi noti da verificare al termine dell'esecuzione */
  readonly knownCases: readonly KnownCase[];
  /** Azione da eseguire se nessun caso noto corrisponde */
  readonly fallbackAction: CaseAction;
  /** Limite massimo di iterazioni per la protezione anti-loop */
  readonly maxIterations?: number;
}

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

---

## 3. Catalogo Step

Gli step sono organizzati per categoria. Ogni categoria ha una responsabilita specifica.

### 3.1 Data Steps (Recupero dati)

```
StepKind: 'data'
```

Questi step raccolgono dati grezzi. Tipicamente restituiscono `'continue'` perche non analizzano i dati.

| Step                      | Input (da context)                | Output                                 | Descrizione                   |
| ------------------------- | --------------------------------- | -------------------------------------- | ----------------------------- |
| `CloudWatchLogsQueryStep` | logGroups, query, timeRange       | `readonly ResultField[][]`             | Esegue query CW Logs Insights |
| `CloudWatchMetricsStep`   | namespace, metricName, dimensions | `readonly MetricDatapoint[]`           | Recupera metriche CW          |
| `AthenaQueryStep`         | database, query                   | `readonly Record<string, string>[]`    | Esegue query Athena           |
| `DynamoDBQueryStep`       | tableName, keyCondition           | `readonly Record<string, unknown>[]`   | Query DynamoDB                |
| `DynamoDBGetStep`         | tableName, key                    | `Record<string, unknown> \| undefined` | Get singolo item              |
| `HttpRequestStep`         | url, method, headers, body        | `HttpResponse`                         | Chiamata HTTP                 |

### 3.2 Transform Steps (Trasformazione dati)

```
StepKind: 'transform'
```

Questi step analizzano e trasformano i dati. Sono i candidati principali per restituire `'resolve'` quando identificano un pattern significativo (un messaggio di errore, una anomalia).

| Step               | Input                  | Output                | Descrizione                                |
| ------------------ | ---------------------- | --------------------- | ------------------------------------------ |
| `ExtractFieldStep` | stepId, fieldPath      | `string`              | Estrae un campo da un risultato precedente |
| `RegexExtractStep` | stepId, pattern, group | `string \| undefined` | Estrae con regex                           |
| `MapStep`          | stepId, mappingFn      | `unknown[]`           | Trasforma array di risultati               |
| `TemplateStep`     | template con `{{var}}` | `string`              | Interpola variabili nel template           |

### 3.3 Check Steps (Verifica condizioni)

```
StepKind: 'check'
```

Questi step verificano condizioni. Possono restituire `'resolve'` quando un'asserzione conferma una diagnosi.

| Step               | Input                 | Output    | Descrizione                                |
| ------------------ | --------------------- | --------- | ------------------------------------------ |
| `AssertStep`       | condition             | `boolean` | Verifica una condizione, fallisce se false |
| `CompareStep`      | left, operator, right | `boolean` | Confronto tra due valori                   |
| `PatternMatchStep` | value, regex          | `boolean` | Verifica match regex                       |
| `ExistsStep`       | stepId, fieldPath     | `boolean` | Verifica esistenza di un valore            |

### 3.4 Mutation Steps (Modifiche)

```
StepKind: 'mutation'
```

| Step                   | Input                   | Output         | Descrizione                   |
| ---------------------- | ----------------------- | -------------- | ----------------------------- |
| `DynamoDBUpdateStep`   | tableName, key, updates | `void`         | Aggiorna item DynamoDB        |
| `DynamoDBPutStep`      | tableName, item         | `void`         | Inserisce item DynamoDB       |
| `HttpPostStep`         | url, body               | `HttpResponse` | POST HTTP                     |
| `SendNotificationStep` | channel, message        | `void`         | Invia notifica (Slack, email) |

### 3.5 Control Flow Steps (Controllo flusso)

```
StepKind: 'control'
```

| Step         | Input                                             | Output | Descrizione                                        |
| ------------ | ------------------------------------------------- | ------ | -------------------------------------------------- |
| `IfStep`     | condition, thenGoTo/thenSteps, elseGoTo/elseSteps | `void` | Branching condizionale (con supporto sub-pipeline) |
| `SwitchStep` | value, cases (value->goTo o value->Step[])        | `void` | Multi-way branching (con supporto sub-pipeline)    |
| `SetVarStep` | varName, value/expression                         | `void` | Imposta una variabile nel contesto                 |
| `LogStep`    | message, level                                    | `void` | Scrive un log entry                                |

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
  /**
   * Raccoglie tutti i valori risolti dai riferimenti di una condizione.
   * Usato per popolare resolvedValues nel CaseEvaluationTrace.
   */
  collectResolvedValues(condition: Condition, context: RunbookContext): Readonly<Record<string, unknown>>;

  evaluate(condition: Condition, context: RunbookContext): boolean;
}
```

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
 * Motore di esecuzione dei runbook.
 * Orchestrazione: esegue step in sequenza, gestisce il flusso,
 * e alla fine verifica i casi noti.
 *
 * Funzionalità principali:
 * - Protezione anti-loop con maxIterations
 * - Supporto continueOnFailure per step resilienti
 * - Esecuzione di sub-pipeline annidate
 * - Supporto direttiva 'resolve' con valutazione intermedia dei casi noti
 * - Terminazione anticipata della pipeline se un caso noto corrisponde
 */
class RunbookEngine {
  constructor(
    private readonly logger: GOLogger,
    private readonly conditionEvaluator: ConditionEvaluator,
  ) {}

  /**
   * Esegue un runbook completo.
   *
   * Flusso:
   * 1. Inizializza il contesto con i parametri di input
   * 2. Esegue gli step in sequenza (rispettando le FlowDirective)
   *    - Se uno step restituisce 'resolve', valuta i casi noti:
   *      - Se un caso corrisponde -> termina la pipeline (early resolution)
   *      - Se nessun caso corrisponde -> prosegue allo step successivo
   * 3. Al termine, se non c'e stata early resolution, valuta i casi noti in ordine di priorita
   * 4. Esegue l'azione del primo caso che corrisponde
   * 5. Se nessun caso corrisponde, esegue la fallbackAction
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

    // executeSteps restituisce anche l'eventuale early resolution
    const { context: finalContext, earlyResolution } = await this.executeSteps(
      runbook.steps,
      runbook.knownCases,
      context,
      maxIterations,
      runbook.metadata.id,
    );

    // Fase 2: match dei casi noti solo se non c'e stata early resolution
    const matchedCase =
      earlyResolution !== undefined
        ? earlyResolution.matchedCase
        : this.matchKnownCases(runbook.knownCases, finalContext);

    const action = matchedCase?.action ?? runbook.fallbackAction;
    await this.executeAction(action, finalContext);

    return this.buildResult(finalContext, matchedCase, earlyResolution);
  }
}
```

### 5.2 Algoritmo di Esecuzione Step (con protezione anti-loop, continueOnFailure e resolve)

```typescript
/**
 * Risultato di una early resolution tentata dopo un segnale 'resolve'.
 */
interface EarlyResolutionResult {
  /** Il caso noto che ha fatto match */
  readonly matchedCase: KnownCase;
  /** ID dello step che ha segnalato 'resolve' */
  readonly resolvedAtStepId: string;
}

/**
 * Esegue gli step in sequenza rispettando le FlowDirective.
 * Include protezione anti-loop, supporto continueOnFailure
 * e valutazione intermedia dei casi noti su segnale 'resolve'.
 *
 * @param stepDescriptors - Step da eseguire con le relative opzioni
 * @param knownCases - Casi noti per la valutazione intermedia su 'resolve'
 * @param initialContext - Contesto iniziale
 * @param maxIterations - Numero massimo di iterazioni consentite
 * @param runbookId - ID del runbook (per messaggi di errore)
 * @returns Contesto finale e eventuale early resolution
 * @throws RunbookMaxIterationsError se viene superato il limite di iterazioni
 */
private async executeSteps(
  stepDescriptors: readonly StepDescriptor[],
  knownCases: readonly KnownCase[],
  initialContext: RunbookContext,
  maxIterations: number,
  runbookId: string,
): Promise<{ readonly context: RunbookContext; readonly earlyResolution?: EarlyResolutionResult }> {
  let context = initialContext;
  let earlyResolution: EarlyResolutionResult | undefined;

  // Indice degli step per id (per supportare goTo)
  const stepIndex = new Map<string, number>();
  for (let i = 0; i < stepDescriptors.length; i++) {
    const descriptor = stepDescriptors[i];
    if (descriptor !== undefined) {
      stepIndex.set(descriptor.step.id, i);
    }
  }

  let currentIndex = 0;
  let iterations = 0;
  const visitedSequence: string[] = [];

  while (currentIndex < stepDescriptors.length) {
    // Protezione anti-loop
    iterations++;
    if (iterations > maxIterations) {
      const lastStepId = visitedSequence[visitedSequence.length - 1] ?? 'unknown';
      throw new RunbookMaxIterationsError(
        runbookId,
        maxIterations,
        lastStepId,
        visitedSequence,
      );
    }

    const descriptor = stepDescriptors[currentIndex];
    if (descriptor === undefined) break;

    const { step, continueOnFailure } = descriptor;
    visitedSequence.push(step.id);

    // Rilevamento ciclo a runtime: controlla se la sequenza degli ultimi N step si ripete
    if (this.detectRuntimeCycle(visitedSequence)) {
      throw new RunbookMaxIterationsError(
        runbookId,
        maxIterations,
        step.id,
        visitedSequence,
      );
    }

    this.logger.info(`[${step.id}] ${step.label}`);

    let result: StepResult<unknown>;

    try {
      result = await step.execute(context);
    } catch (error: unknown) {
      // Supporto continueOnFailure
      if (continueOnFailure === true) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[${step.id}] Step fallito ma continueOnFailure=true: ${errorMessage}`,
        );

        const recoveryInfo: ErrorRecoveryInfo = {
          stepId: step.id,
          originalError: errorMessage,
          failedAt: new Date(),
          skipped: true,
        };

        result = {
          success: false,
          error: errorMessage,
          errorRecovery: recoveryInfo,
        };

        // Aggiungi l'errore recuperato al contesto
        context = {
          ...context,
          recoveredErrors: [...context.recoveredErrors, recoveryInfo],
        };
      } else {
        throw error;
      }
    }

    // Aggiorna contesto (immutabile)
    context = this.updateContext(context, step.id, result);

    // Se lo step e fallito con continueOnFailure, prosegui allo step successivo
    if (result.success === false && continueOnFailure === true) {
      currentIndex++;
      continue;
    }

    // Determina prossimo step
    const directive = result.next ?? 'continue';

    if (directive === 'stop') {
      break;
    } else if (directive === 'resolve') {
      // Lo step segnala una possibile risoluzione.
      // Valuta i casi noti contro il contesto corrente.
      this.logger.info(`[${step.id}] Segnale 'resolve' ricevuto. Valutazione intermedia dei casi noti...`);

      const matchedCase = this.matchKnownCases(knownCases, context);

      if (matchedCase !== undefined) {
        // Un caso noto corrisponde: terminazione anticipata della pipeline
        this.logger.info(
          `[${step.id}] Early resolution riuscita: caso "${matchedCase.id}" (${matchedCase.description})`,
        );
        earlyResolution = {
          matchedCase,
          resolvedAtStepId: step.id,
        };
        break; // Esce dal ciclo degli step
      } else {
        // Nessun caso corrisponde: lo step era ottimista, si prosegue
        this.logger.info(
          `[${step.id}] Segnale 'resolve' ricevuto ma nessun caso noto corrisponde. Proseguo.`,
        );
        currentIndex++;
      }
    } else if (directive === 'continue') {
      currentIndex++;
    } else {
      // goTo
      const targetIndex = stepIndex.get(directive.goTo);
      if (targetIndex === undefined) {
        throw new Error(`Step not found: ${directive.goTo}`);
      }
      currentIndex = targetIndex;
    }
  }

  return { context, earlyResolution };
}

/**
 * Rileva cicli a runtime analizzando la sequenza degli step visitati.
 * Cerca pattern ripetuti nella coda della sequenza.
 *
 * @param visitedSequence - Sequenza degli step ID visitati
 * @returns true se viene rilevato un ciclo
 */
private detectRuntimeCycle(visitedSequence: readonly string[]): boolean {
  const minCycleLength = 2;
  const maxCycleLength = 20;

  for (let cycleLen = minCycleLength; cycleLen <= maxCycleLength; cycleLen++) {
    // Servono almeno 3 ripetizioni del ciclo per confermarlo
    const requiredLength = cycleLen * 3;
    if (visitedSequence.length < requiredLength) continue;

    const tail = visitedSequence.slice(-requiredLength);
    let isCycle = true;

    for (let i = 0; i < cycleLen; i++) {
      const first = tail[i];
      const second = tail[i + cycleLen];
      const third = tail[i + cycleLen * 2];
      if (first !== second || second !== third) {
        isCycle = false;
        break;
      }
    }

    if (isCycle) {
      return true;
    }
  }

  return false;
}
```

### 5.3 Matching dei Casi Noti

```typescript
private matchKnownCases(
  knownCases: readonly KnownCase[],
  context: RunbookContext,
): KnownCase | undefined {
  // Ordina per priorita decrescente
  const sorted = [...knownCases].sort((a, b) => b.priority - a.priority);

  for (const knownCase of sorted) {
    if (this.conditionEvaluator.evaluate(knownCase.condition, context)) {
      this.logger.info(`Caso noto identificato: ${knownCase.description}`);
      return knownCase;
    }
  }

  this.logger.warn('Nessun caso noto corrisponde al risultato.');
  return undefined;
}
```

### 5.4 Flusso di Esecuzione del Motore

Il flusso di esecuzione del motore e il seguente:

```
Fase 1: Esecuzione Step
  per ogni step:
    esegui step -> ottieni StepResult
    aggiorna contesto
    se next === 'resolve':
      valuta tutti i knownCases contro il contesto corrente
      SE un caso corrisponde:
        registra nel trace
        BREAK (terminazione anticipata)
      ALTRIMENTI:
        registra "resolve tentato, nessun match"
        prosegui allo step successivo
    altrimenti se next === 'stop':
      BREAK
    altrimenti se next === 'continue':
      prosegui
    altrimenti se next === { goTo: ... }:
      salta allo step indicato

Fase 2: Match Casi Noti (solo se non c'e stata early resolution)
  se la pipeline e terminata normalmente (nessuna early resolution):
    valuta tutti i casi noti
  altrimenti:
    salta (gia matchato nella Fase 1)

Fase 3: Esecuzione Azione
  esegui l'azione del caso matchato o la fallback action
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

/** Composizione di piu azioni */
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
  readonly cloudWatchLogs: CloudWatchLogsService;
  readonly cloudWatchMetrics: CloudWatchMetricsService;
  readonly athena: AthenaService;
  readonly dynamodb: RunbookDynamoDBService;
  readonly http: RunbookHttpService;
}
```

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
  | 'INVALID_GOTO_REF'
  | 'LOOP_DETECTED'
  | 'DUPLICATE_CASE_ID'
  | 'DUPLICATE_CASE_PRIORITY'
  | 'MISSING_METADATA'
  | 'MISSING_FALLBACK'
  | 'EMPTY_STEPS';

/**
 * Builder fluent per la creazione di runbook.
 * Include validazione automatica prima del build.
 * Il segnale 'resolve' viene restituito dallo step nel suo StepResult,
 * non configurato nel builder.
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
 *   .step(queryCloudWatchLogs({ ... }))
 *   .step(extractField({ ... }), { continueOnFailure: true })
 *   .ifBranch({
 *     id: 'check-timeout',
 *     label: 'Verifica timeout',
 *     condition: { type: 'compare', ref: 'vars.statusCode', operator: '==', value: '504' },
 *     thenSteps: [queryCloudWatchLogs({ ... }), extractField({ ... })],
 *     elseSteps: [setVar({ ... })],
 *   })
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
   * Aggiunge un IfStep con sub-pipeline annidate.
   * Alternativa a ifCondition con goTo: le pipeline then/else vengono
   * eseguite inline in un contesto figlio.
   *
   * @param config - Configurazione dell'if branch con sub-pipeline
   */
  ifBranch(config: IfBranchConfig): RunbookBuilder {
    const branchStep = new IfBranchStep(config);
    this.stepDescriptors.push({ step: branchStep });
    return this;
  }

  /**
   * Aggiunge un SwitchStep con sub-pipeline annidate.
   * Alternativa a switchOn con goTo: le pipeline per ogni caso vengono
   * eseguite inline in un contesto figlio.
   *
   * @param config - Configurazione dello switch branch con sub-pipeline
   */
  switchBranch(config: SwitchBranchConfig): RunbookBuilder {
    const branchStep = new SwitchBranchStep(config);
    this.stepDescriptors.push({ step: branchStep });
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
   * Esegue la validazione del runbook.
   * Controlla: step ID duplicati, riferimenti goTo invalidi,
   * cicli nel grafo, KnownCase con ID o priorita duplicate.
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

    // 3. Verifica riferimenti goTo (analisi statica delle FlowDirective note)
    const goToRefs = this.collectGoToReferences();
    for (const ref of goToRefs) {
      if (!stepIds.has(ref.targetId)) {
        errors.push({
          code: 'INVALID_GOTO_REF',
          message: `Lo step "${ref.sourceId}" referenzia goTo "${ref.targetId}" che non esiste.`,
          stepId: ref.sourceId,
        });
      }
    }

    // 4. Rilevamento cicli nel grafo goTo
    const cycles = this.detectGoToCycles(stepIds, goToRefs);
    for (const cycle of cycles) {
      errors.push({
        code: 'LOOP_DETECTED',
        message: `Ciclo rilevato nel grafo goTo: ${cycle.join(' -> ')}.`,
        stepId: cycle[0],
      });
    }

    // 5. Verifica KnownCase ID duplicati
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

    // 6. Verifica KnownCase priorita duplicate
    const casePriorities = new Map<number, string>();
    for (const knownCase of this.cases) {
      const existingCaseId = casePriorities.get(knownCase.priority);
      if (existingCaseId !== undefined) {
        errors.push({
          code: 'DUPLICATE_CASE_PRIORITY',
          message: `KnownCase "${knownCase.id}" ha la stessa priorita (${knownCase.priority}) di "${existingCaseId}". Le priorita devono essere univoche.`,
          caseId: knownCase.id,
        });
      }
      casePriorities.set(knownCase.priority, knownCase.id);
    }

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

  /**
   * Raccoglie tutti i riferimenti goTo dagli step registrati.
   * Analizza IfStep e SwitchStep per estrarre i target goTo.
   */
  private collectGoToReferences(): readonly GoToReference[] {
    const refs: GoToReference[] = [];

    for (const descriptor of this.stepDescriptors) {
      const step = descriptor.step;

      if (isIfStep(step)) {
        if (step.thenGoTo !== undefined) {
          refs.push({ sourceId: step.id, targetId: step.thenGoTo });
        }
        if (step.elseGoTo !== undefined) {
          refs.push({ sourceId: step.id, targetId: step.elseGoTo });
        }
      }

      if (isSwitchStep(step)) {
        for (const [, targetId] of step.goToCases) {
          refs.push({ sourceId: step.id, targetId });
        }
      }
    }

    return refs;
  }

  /**
   * Rileva cicli nel grafo orientato definito dai goTo.
   * Usa DFS (Depth-First Search) con colorazione dei nodi.
   *
   * @param stepIds - Set di tutti gli step ID validi
   * @param goToRefs - Riferimenti goTo raccolti
   * @returns Array di cicli trovati (ogni ciclo e un array di step ID)
   */
  private detectGoToCycles(stepIds: ReadonlySet<string>, goToRefs: readonly GoToReference[]): readonly string[][] {
    // Costruisci grafo di adiacenza
    const adjacency = new Map<string, string[]>();
    for (const id of stepIds) {
      adjacency.set(id, []);
    }

    // Aggiungi anche l'arco implicito "step[i] -> step[i+1]" per flusso sequenziale
    for (let i = 0; i < this.stepDescriptors.length - 1; i++) {
      const current = this.stepDescriptors[i];
      const next = this.stepDescriptors[i + 1];
      if (current !== undefined && next !== undefined) {
        const edges = adjacency.get(current.step.id);
        if (edges !== undefined) {
          edges.push(next.step.id);
        }
      }
    }

    // Aggiungi archi goTo
    for (const ref of goToRefs) {
      const edges = adjacency.get(ref.sourceId);
      if (edges !== undefined) {
        edges.push(ref.targetId);
      }
    }

    // DFS con colorazione: WHITE=non visitato, GRAY=in corso, BLACK=completato
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const id of stepIds) {
      color.set(id, WHITE);
    }

    const cycles: string[][] = [];
    const path: string[] = [];

    const dfs = (nodeId: string): void => {
      color.set(nodeId, GRAY);
      path.push(nodeId);

      const neighbors = adjacency.get(nodeId) ?? [];
      for (const neighbor of neighbors) {
        const neighborColor = color.get(neighbor);
        if (neighborColor === GRAY) {
          // Ciclo trovato: estrai il ciclo dal path
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), neighbor]);
          }
        } else if (neighborColor === WHITE) {
          dfs(neighbor);
        }
      }

      path.pop();
      color.set(nodeId, BLACK);
    };

    for (const id of stepIds) {
      if (color.get(id) === WHITE) {
        dfs(id);
      }
    }

    return cycles;
  }
}

/**
 * Riferimento goTo per l'analisi statica del grafo.
 */
interface GoToReference {
  readonly sourceId: string;
  readonly targetId: string;
}

/**
 * Type guard per verificare se uno step e un IfStep con goTo.
 */
function isIfStep(step: Step): step is Step & {
  readonly thenGoTo?: string;
  readonly elseGoTo?: string;
} {
  return step.kind === 'control' && 'condition' in step && ('thenGoTo' in step || 'elseGoTo' in step);
}

/**
 * Type guard per verificare se uno step e un SwitchStep con goTo.
 */
function isSwitchStep(step: Step): step is Step & {
  readonly goToCases: ReadonlyMap<string, string>;
} {
  return step.kind === 'control' && 'goToCases' in step;
}
````

### Step Factory Functions

Ogni tipo di step ha una factory function per facilitare la creazione.

```typescript
// Data steps
function queryCloudWatchLogs(config: CloudWatchLogsQueryConfig): CloudWatchLogsQueryStep;
function queryDynamoDB(config: DynamoDBQueryConfig): DynamoDBQueryStep;
function httpRequest(config: HttpRequestConfig): HttpRequestStep;

// Transform steps
function extractField(config: ExtractFieldConfig): ExtractFieldStep;
function regexExtract(config: RegexExtractConfig): RegexExtractStep;

// Check steps
function assert(config: AssertConfig): AssertStep;
function compare(config: CompareConfig): CompareStep;

// Control flow steps
function ifCondition(config: IfStepConfig): IfStep;
function switchOn(config: SwitchStepConfig): SwitchStep;
function setVar(config: SetVarConfig): SetVarStep;
function log(config: LogStepConfig): LogStep;

// Actions
function logAction(config: LogActionConfig): LogAction;
function notifyAction(config: NotifyActionConfig): NotifyAction;
function escalateAction(config: EscalateActionConfig): EscalateAction;
```

---

## 9. Esempio Concreto: Alarm Resolution per API Gateway 5xx

### Scenario

Un allarme CloudWatch `pn-address-book-io-IO-ApiGwAlarm` scatta. Il runbook deve:

1. Cercare nei log di CloudWatch l'errore che ha causato l'allarme
2. Estrarre il codice di errore e il traceId
3. **Segnalare `'resolve'` dopo l'estrazione** per tentare una risoluzione anticipata
4. Se non risolta, e l'errore e un timeout (`504`), verificare la latenza del downstream tramite **sub-pipeline annidata**
5. Determinare il caso noto e agire di conseguenza

### Definizione del Runbook

```typescript
import {
  RunbookBuilder,
  queryCloudWatchLogs,
  extractField,
  regexExtract,
  ifCondition,
  setVar,
  log,
  logAction,
  notifyAction,
  escalateAction,
} from '@go-automation/go-runbook-engine';

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
    queryCloudWatchLogs({
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

  // -- STEP 2: Verifica che ci siano risultati --
  .step(
    ifCondition({
      id: 'check-results-exist',
      label: 'Verifica presenza errori nei log',
      condition: {
        type: 'exists',
        ref: 'steps.query-5xx-errors.output[0]',
      },
      elseGoTo: 'no-errors-found',
    }),
  )

  // -- STEP 3: Estrai il codice di stato piu frequente --
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
  // Questo step di analisi restituisce 'resolve' quando trova un errorCode.
  // Il motore valuta i casi noti: se "rate-limiting" o "internal-error" matchano,
  // la pipeline si ferma qui senza eseguire la costosa query downstream.
  .step(
    regexExtract({
      id: 'extract-error-code',
      label: 'Estrai codice errore dal messaggio',
      fromStep: 'query-5xx-errors',
      fieldPath: '[0].@message',
      pattern: '"errorCode":\\s*"([A-Z_]+)"',
      group: 1,
      saveAs: 'errorCode',
      // Lo step segnala 'resolve' se trova un errorCode
      resolveOnMatch: true,
    }),
    { continueOnFailure: true },
  )

  // -- STEP 6: Se 504 (timeout), usa sub-pipeline per indagare latenza --
  // Questo step viene eseguito SOLO se la early resolution al passo 5 non ha trovato
  // un caso noto (es. l'errore e un timeout che richiede ulteriore indagine).
  .ifBranch({
    id: 'check-timeout',
    label: 'Verifica se errore e timeout (504)',
    condition: {
      type: 'compare',
      ref: 'vars.statusCode',
      operator: '==',
      value: '504',
    },
    thenSteps: [
      queryCloudWatchLogs({
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
      extractField({
        id: 'extract-slow-service',
        label: 'Identifica servizio piu lento',
        fromStep: 'query-downstream-latency',
        fieldPath: '[0].downstreamService',
        saveAs: 'slowService',
      }),
    ],
    elseSteps: [
      setVar({
        id: 'set-diagnosis-non-timeout',
        label: 'Imposta diagnosi per errore non-timeout',
        varName: 'diagnosis',
        expression: '{{vars.statusCode}} - {{vars.errorCode}}',
      }),
    ],
  })

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

  // -- STEP (label): Nessun errore trovato --
  .step(
    setVar({
      id: 'no-errors-found',
      label: 'Nessun errore trovato nei log',
      varName: 'diagnosis',
      expression: 'NO_ERRORS_IN_LOGS',
    }),
  )

  // ---------------------------------------------------------------
  // CASI NOTI
  // ---------------------------------------------------------------

  // Caso 1: Timeout dovuto a downstream lento
  .knownCase({
    id: 'downstream-timeout',
    description: 'Timeout causato da servizio downstream lento',
    priority: 10,
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
  // Questo caso puo essere matchato alla early resolution dopo lo step 5,
  // evitando di eseguire la costosa query downstream allo step 6.
  .knownCase({
    id: 'rate-limiting',
    description: 'Errore causato da throttling / rate limiting',
    priority: 8,
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
  // Anche questo caso puo essere matchato alla early resolution dopo lo step 5.
  .knownCase({
    id: 'internal-error',
    description: 'Errore interno del servizio',
    priority: 5,
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

  // Caso 4: Nessun errore trovato (allarme rientrato)
  .knownCase({
    id: 'alarm-resolved',
    description: 'Nessun errore nei log - allarme probabilmente rientrato',
    priority: 3,
    condition: {
      type: 'compare',
      ref: 'vars.diagnosis',
      operator: '==',
      value: 'NO_ERRORS_IN_LOGS',
    },
    action: {
      type: 'log',
      level: 'info',
      message: 'Allarme rientrato autonomamente. Nessuna azione necessaria.',
    },
  })

  // Fallback: caso non riconosciuto
  .fallback(
    escalateAction({
      team: 'GO',
      severity: 'high',
      message: 'Caso non riconosciuto. Diagnosi: {{vars.diagnosis}}, TraceId: {{vars.traceId}}',
    }),
  )

  .build();
```

### Come funziona la Early Resolution in questo esempio

**Scenario A: errorCode = `RATE_LIMIT` (early resolution riuscita)**

1. Step 1 (`query-5xx-errors`): query CloudWatch, trova errori 500 con `RATE_LIMIT` -> `next: 'continue'`
2. Step 2 (`check-results-exist`): risultati trovati -> `next: 'continue'`
3. Step 3 (`extract-status-code`): estrae `500` -> `next: 'continue'`
4. Step 4 (`extract-trace-id`): estrae `1-abc-def` -> `next: 'continue'`
5. Step 5 (`extract-error-code`): estrae `RATE_LIMIT` -> **`next: 'resolve'`**
   - Il motore valuta i casi noti contro il contesto corrente
   - Il caso `rate-limiting` matcha (pattern `RATE_LIMIT`)
   - **Pipeline terminata.** Step 6-8 non vengono eseguiti
   - Si procede direttamente all'azione del caso `rate-limiting`

**Scenario B: errorCode = `DOWNSTREAM_TIMEOUT` (early resolution fallita, prosegue)**

1. Step 1-4: come sopra, estrae `504` e `DOWNSTREAM_TIMEOUT`
2. Step 5 (`extract-error-code`): estrae `DOWNSTREAM_TIMEOUT` -> **`next: 'resolve'`**
   - Il motore valuta i casi noti
   - `downstream-timeout` richiede `vars.slowService` che non esiste ancora
   - `rate-limiting` non matcha (pattern diverso)
   - `internal-error` non matcha (status e 504, non 500)
   - **Nessun match.** La pipeline prosegue normalmente
3. Step 6 (`check-timeout`): condizione vera, esegue sub-pipeline downstream
4. Step 7-8: diagnosi e log
5. Al termine: il caso `downstream-timeout` ora matcha (esiste `vars.slowService`)

### Esecuzione del Runbook

```typescript
import { Core, AWS } from '@go-automation/go-common';
import { RunbookEngine, ConditionEvaluator, createServiceRegistry } from '@go-automation/go-runbook-engine';
import { apiGateway5xxRunbook } from './runbooks/apiGateway5xx';

// Dentro uno script GOScript
const script = new Core.GOScript({
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

  // Esegui runbook
  const engine = new RunbookEngine(ctx.logger, new ConditionEvaluator());
  const result = await engine.execute(apiGateway5xxRunbook, params, services);

  // Output risultato
  ctx.logger.section('Risultato Esecuzione');
  ctx.logger.info(`Runbook: ${result.runbookId}`);
  ctx.logger.info(`Stato: ${result.status}`);
  ctx.logger.info(`Caso noto: ${result.matchedCase?.description ?? 'Nessuno'}`);
  ctx.logger.info(`Durata: ${result.durationMs}ms`);
  ctx.logger.info(`Step eseguiti: ${result.stepsExecuted}`);

  // Mostra informazioni sulla early resolution
  if (result.earlyResolution === true) {
    ctx.logger.section('Early Resolution');
    ctx.logger.info(`Pipeline terminata anticipatamente allo step: ${result.resolvedAtStep}`);
    ctx.logger.info(`Step risparmiati grazie alla early resolution`);
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
|  |  +---------+   +---------+   +-----------+   +--------+          | |
|  |  | Step 1  |-->| Step 2  |-->| Step 3    |-->| Step N |          | |
|  |  | (data)  |   |(extract)|   | (analyze) |   |  ...   |          | |
|  |  |continue |   |continue |   |           |   +--------+          | |
|  |  |OnFailure|   |OnFailure|   +-----+-----+                       | |
|  |  +---------+   +---------+         |                              | |
|  |                             next='resolve'                        | |
|  |                                    |                              | |
|  |                          +---------v----------+                   | |
|  |                          | Valuta KnownCases  |                   | |
|  |                          | contro contesto    |                   | |
|  |                          | corrente           |                   | |
|  |                          +---------+----------+                   | |
|  |                           match? / \ no match?                    | |
|  |                                /     \                            | |
|  |                    +----------v+   +--v-----------+               | |
|  |                    | EARLY     |   | Prosegui al  |               | |
|  |                    | RESOLUTION|   | prossimo step|               | |
|  |                    | -> BREAK  |   | (continue)   |               | |
|  |                    +-----------+   +----+---------+               | |
|  |                          |              |                         | |
|  |                          |        +-----v-----+                   | |
|  |                          |        | IF branch |                   | |
|  |                          |        +-----+-----+                   | |
|  |                          |     then |       | else                | |
|  |                          |  +-------v-+ +-v--------+              | |
|  |                          |  |SubPipe  | |SubPipe   |              | |
|  |                          |  |[step,..]| |[step,..]|              | |
|  |                          |  +----+----+ +----+-----+              | |
|  |                          |       |           |                    | |
|  |                          |       +-----+-----+                    | |
|  |                          |             | merge context            | |
|  |                          |             v                          | |
|  +------------------------------------------------------------------+ |
|                         |         |                                    |
|  3. MATCH KNOWN CASES   v         |                                    |
|  +------------------------------------------------------------------+ |
|  |  (solo se NON c'e stata early resolution)                         | |
|  |                                                                   | |
|  |  Final Context                                                    | |
|  |  +--------------+                                                 | |
|  |  | vars:        |    +--------------+                             | |
|  |  |  statusCode  |--->| KnownCase 1  |--match?--> Action          | |
|  |  |  errorCode   |    | KnownCase 2  |--match?--> Action          | |
|  |  |  traceId     |    | KnownCase 3  |--match?--> Action          | |
|  |  |  diagnosis   |    | KnownCase 4  |--match?--> Action          | |
|  |  +--------------+    +--------------+                             | |
|  |                              |                                    | |
|  |                    no match? v                                    | |
|  |                      +--------------+                             | |
|  |                      | Fallback     |                             | |
|  |                      | Action       |                             | |
|  |                      +--------------+                             | |
|  +------------------------------------------------------------------+ |
|                                                                       |
|  4. RESULT                                                            |
|  +------------------------------------------------------------------+ |
|  | RunbookExecutionResult {                                          | |
|  |   runbookId, status, matchedCase, durationMs,                     | |
|  |   stepsExecuted, finalContext, recoveredErrors, trace,             | |
|  |   earlyResolution, resolvedAtStep                                 | |
|  | }                                                                 | |
|  +------------------------------------------------------------------+ |
+----------------------------------------------------------------------+
```

---

## 11. Trace

### 11.1 Panoramica

Al termine di ogni esecuzione, il motore produce un **trace strutturato** (`RunbookExecutionTrace`) che documenta nel dettaglio ogni fase dell'esecuzione: step eseguiti, variabili prodotte, caso noto identificato e azione eseguita.

Il trace e progettato per quattro scenari di utilizzo:

| Scenario                  | Descrizione                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| **Persistenza**           | Salvataggio su DynamoDB/S3 per storicizzazione e audit trail                                        |
| **Analisi LLM**           | Input strutturato per un modello di linguaggio che analizza l'esecuzione e suggerisce miglioramenti |
| **Debugging**             | Ricostruzione esatta del flusso di esecuzione per identificare problemi                             |
| **Dashboard / Reporting** | Estrazione di metriche aggregate (durata, step falliti, casi noti piu frequenti)                    |

Il campo `schemaVersion` garantisce compatibilita in avanti: i consumatori possono gestire versioni diverse del formato senza rotture.

---

### 11.2 Interfacce TypeScript

Tutte le interfacce seguono le convenzioni del progetto: `readonly` su ogni proprieta, named exports, un file per interfaccia (vedi Sezione 12).

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
  readonly schemaVersion: '1.0.0';
  /** Informazioni generali sull'esecuzione */
  readonly execution: ExecutionInfo;
  /** Parametri di input forniti al runbook */
  readonly input: Readonly<Record<string, string>>;
  /** Trace di ogni step eseguito nella pipeline */
  readonly pipeline: readonly StepTrace[];
  /** Stato finale delle variabili al termine dell'esecuzione */
  readonly variables: Readonly<Record<string, string>>;
  /** Dettaglio del matching dei casi noti */
  readonly caseMatching: CaseMatchingTrace;
  /** Dettaglio dell'azione eseguita */
  readonly actionExecuted: ActionTrace;
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
  /** Come lo step e stato raggiunto nel flusso di esecuzione */
  readonly reachedVia: 'sequential' | 'goTo' | 'subPipeline';
  /** ID dello step padre (solo se reachedVia === 'subPipeline') */
  readonly parentStepId?: string;
  /** Timestamp di inizio esecuzione dello step (ISO 8601) */
  readonly startedAt: string;
  /** Timestamp di completamento dello step (ISO 8601) */
  readonly completedAt: string;
  /** Durata in millisecondi */
  readonly durationMs: number;
  /** Stato dello step */
  readonly status: 'success' | 'failed' | 'skipped';
  /** Se lo step e stato recuperato tramite continueOnFailure (vedi Sezione 16.2) */
  readonly recovered: boolean;
  /** Input fornito allo step */
  readonly input: unknown;
  /** Output prodotto dallo step */
  readonly output: unknown;
  /** Messaggio di errore (solo se status === 'failed') */
  readonly error?: string;
  /** Variabili scritte nel contesto da questo step */
  readonly varsWritten: Readonly<Record<string, string>>;
  /** Direttiva di flusso prodotta: 'continue', 'stop', 'resolve', o ID dello step target per goTo */
  readonly flowDirective: 'continue' | 'stop' | 'resolve' | string;
  /**
   * Se lo step ha segnalato 'resolve', il risultato della valutazione
   * intermedia dei casi noti. Presente solo quando flowDirective === 'resolve'.
   */
  readonly earlyResolution?: EarlyResolutionTrace;
}
```

#### EarlyResolutionTrace

```typescript
/**
 * Trace di un tentativo di risoluzione anticipata.
 * Generato quando uno step restituisce la direttiva 'resolve'.
 * Documenta quali casi sono stati valutati e se uno ha fatto match.
 */
interface EarlyResolutionTrace {
  /** Se un caso noto ha fatto match durante la valutazione intermedia */
  readonly resolved: boolean;
  /** ID del caso noto che ha fatto match (undefined se nessun match) */
  readonly matchedCaseId?: string;
  /** Tutti i casi valutati durante la risoluzione anticipata */
  readonly evaluations: readonly CaseEvaluationTrace[];
}
```

#### CaseMatchingTrace

```typescript
/**
 * Trace del processo di matching dei casi noti (vedi Sezione 5.3).
 * Documenta ogni caso valutato, la condizione applicata e il risultato.
 */
interface CaseMatchingTrace {
  /** Numero totale di casi valutati */
  readonly casesEvaluated: number;
  /** Dettaglio di ogni valutazione */
  readonly evaluations: readonly CaseEvaluationTrace[];
  /** ID del caso che ha fatto match (null se nessun match) */
  readonly matchedCaseId: string | null;
  /**
   * Se il matching e avvenuto durante una early resolution
   * piuttosto che alla fine della pipeline.
   */
  readonly resolvedEarly: boolean;
  /**
   * ID dello step che ha innescato la early resolution.
   * Presente solo se resolvedEarly === true.
   */
  readonly resolvedAtStepId?: string;
}

/**
 * Trace della valutazione di un singolo caso noto.
 * Include la condizione, i valori risolti e il risultato del match.
 */
interface CaseEvaluationTrace {
  /** ID del caso noto */
  readonly caseId: string;
  /** Descrizione leggibile del caso */
  readonly description: string;
  /** Priorita del caso (ordine di valutazione decrescente) */
  readonly priority: number;
  /** Condizione valutata (vedi Sezione 4) */
  readonly condition: Condition;
  /** Se la condizione ha fatto match */
  readonly matched: boolean;
  /** Valori effettivi delle variabili riferite nella condizione */
  readonly resolvedValues: Readonly<Record<string, unknown>>;
}
```

#### ActionTrace

```typescript
/**
 * Trace dell'azione eseguita dopo il matching dei casi noti (vedi Sezione 6).
 * Documenta il tipo di azione, il risultato e la durata.
 */
interface ActionTrace {
  /** Se un'azione e stata effettivamente eseguita */
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
  /** Outcome sintetico: caso noto identificato e azione eseguita */
  readonly outcome: string;
  /** Se la risoluzione e avvenuta anticipatamente */
  readonly earlyResolution: boolean;
  /** Numero di step risparmiati grazie alla early resolution */
  readonly stepsSavedByEarlyResolution: number;
}
```

---

### 11.3 RunbookExecutionResult

Il `RunbookExecutionResult` include il trace strutturato e le informazioni sulla early resolution.

```typescript
/**
 * Risultato dell'esecuzione completa di un runbook.
 * Include il contesto finale, il caso noto identificato, il trace strutturato
 * e le informazioni sulla early resolution.
 */
interface RunbookExecutionResult {
  /** ID del runbook eseguito */
  readonly runbookId: string;
  /** Stato finale dell'esecuzione */
  readonly status: 'completed' | 'failed' | 'stopped';
  /** Caso noto identificato (undefined se nessun match) */
  readonly matchedCase?: KnownCase;
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
  /** Se il runbook e stato risolto anticipatamente tramite il segnale 'resolve' */
  readonly earlyResolution?: boolean;
  /** ID dello step che ha innescato la early resolution */
  readonly resolvedAtStep?: string;
}
```

---

### 11.4 Esempio Concreto: Trace JSON con Early Resolution

Questo esempio mostra il trace prodotto dall'esecuzione del runbook **API Gateway 5xx Alarm Resolution** nello **Scenario A** (early resolution riuscita): un errore `RATE_LIMIT` viene identificato allo step 5 e il caso `rate-limiting` matcha immediatamente, evitando gli step 6-8.

```json
{
  "schemaVersion": "1.0.0",
  "execution": {
    "executionId": "exec-v6-rate-limit",
    "runbookId": "alarm-api-gw-5xx",
    "runbookName": "API Gateway 5xx Alarm Resolution",
    "runbookVersion": "3.0.0",
    "runbookType": "alarm-resolution",
    "startedAt": "2026-02-16T10:30:00.000Z",
    "completedAt": "2026-02-16T10:30:02.100Z",
    "durationMs": 2100,
    "status": "completed",
    "environment": {
      "awsProfiles": ["sso_pn-core-prod_readonly"],
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
      "executionOrder": 2,
      "stepId": "check-results-exist",
      "label": "Verifica presenza errori nei log",
      "kind": "control",
      "reachedVia": "sequential",
      "startedAt": "2026-02-16T10:30:01.846Z",
      "completedAt": "2026-02-16T10:30:01.847Z",
      "durationMs": 1,
      "status": "success",
      "recovered": false,
      "input": { "condition": { "type": "exists", "ref": "steps.query-5xx-errors.output[0]" } },
      "output": true,
      "varsWritten": {},
      "flowDirective": "continue"
    },
    {
      "executionOrder": 3,
      "stepId": "extract-status-code",
      "label": "Estrai status code prevalente",
      "kind": "transform",
      "reachedVia": "sequential",
      "startedAt": "2026-02-16T10:30:01.848Z",
      "completedAt": "2026-02-16T10:30:01.849Z",
      "durationMs": 1,
      "status": "success",
      "recovered": false,
      "input": { "fromStep": "query-5xx-errors", "fieldPath": "[0].status" },
      "output": "500",
      "varsWritten": { "statusCode": "500" },
      "flowDirective": "continue"
    },
    {
      "executionOrder": 4,
      "stepId": "extract-trace-id",
      "label": "Estrai traceId",
      "kind": "transform",
      "reachedVia": "sequential",
      "startedAt": "2026-02-16T10:30:01.850Z",
      "completedAt": "2026-02-16T10:30:01.850Z",
      "durationMs": 0,
      "status": "success",
      "recovered": false,
      "input": { "fromStep": "query-5xx-errors", "fieldPath": "[0].traceId" },
      "output": "1-xyz-abc",
      "varsWritten": { "traceId": "1-xyz-abc" },
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
      "flowDirective": "resolve",
      "earlyResolution": {
        "resolved": true,
        "matchedCaseId": "rate-limiting",
        "evaluations": [
          {
            "caseId": "downstream-timeout",
            "description": "Timeout causato da servizio downstream lento",
            "priority": 10,
            "condition": {
              "type": "and",
              "conditions": [
                { "type": "compare", "ref": "vars.statusCode", "operator": "==", "value": "504" },
                { "type": "exists", "ref": "vars.slowService" }
              ]
            },
            "matched": false,
            "resolvedValues": {
              "vars.statusCode": "500",
              "vars.slowService": null
            }
          },
          {
            "caseId": "rate-limiting",
            "description": "Errore causato da throttling / rate limiting",
            "priority": 8,
            "condition": {
              "type": "pattern",
              "ref": "vars.errorCode",
              "regex": "THROTTL|RATE_LIMIT|TOO_MANY_REQUESTS"
            },
            "matched": true,
            "resolvedValues": {
              "vars.errorCode": "RATE_LIMIT"
            }
          }
        ]
      }
    }
  ],
  "variables": {
    "statusCode": "500",
    "traceId": "1-xyz-abc",
    "errorCode": "RATE_LIMIT"
  },
  "caseMatching": {
    "casesEvaluated": 2,
    "evaluations": [
      {
        "caseId": "downstream-timeout",
        "description": "Timeout causato da servizio downstream lento",
        "priority": 10,
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
        "priority": 8,
        "condition": {
          "type": "pattern",
          "ref": "vars.errorCode",
          "regex": "THROTTL|RATE_LIMIT|TOO_MANY_REQUESTS"
        },
        "matched": true,
        "resolvedValues": { "vars.errorCode": "RATE_LIMIT" }
      }
    ],
    "matchedCaseId": "rate-limiting",
    "resolvedEarly": true,
    "resolvedAtStepId": "extract-error-code"
  },
  "actionExecuted": {
    "executed": true,
    "actionType": "notify",
    "actionDetail": {
      "type": "notify",
      "channel": "slack:#go-alerts",
      "template": ":traffic_light: *Rate Limiting su API Gateway*\nErrorCode: `RATE_LIMIT`\nAzione: verificare limiti di throttling e scalare se necessario"
    },
    "resolvedMessage": "Rate Limiting su API Gateway. ErrorCode: RATE_LIMIT",
    "status": "success",
    "durationMs": 240
  },
  "summary": {
    "description": "Runbook 'API Gateway 5xx Alarm Resolution' completato con early resolution. Caso noto identificato: rate-limiting. Pipeline terminata allo step 5 di 10.",
    "totalSteps": 10,
    "stepsExecuted": 5,
    "stepsFailed": 0,
    "stepsRecovered": 0,
    "stepsSkipped": 5,
    "outcome": "rate-limiting -> notify",
    "earlyResolution": true,
    "stepsSavedByEarlyResolution": 5
  }
}
```

**Punti chiave dell'esempio:**

- **5 step eseguiti su 10 totali**: la early resolution ha evitato l'esecuzione di 5 step, inclusa la costosa query downstream
- **`flowDirective: "resolve"`** sullo step 5: documenta che lo step ha segnalato una possibile risoluzione
- **`earlyResolution`** sullo step 5: contiene il dettaglio della valutazione intermedia dei casi noti
- **`caseMatching.resolvedEarly: true`**: conferma che il matching e avvenuto durante una early resolution, non alla fine
- **`summary.stepsSavedByEarlyResolution: 5`**: quantifica il risparmio ottenuto
- **Durata 2100ms vs ~4200ms** (stima senza early resolution): la query downstream da sola richiedeva ~1800ms

---

## 12. Principi SOLID Applicati

| Principio                     | Applicazione                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S** - Single Responsibility | Ogni `Step` ha una sola responsabilita. `ConditionEvaluator` valuta solo condizioni. `RunbookEngine` solo orchestra. `RunbookBuilder` solo costruisce e valida. Lo step decide quando segnalare `'resolve'`, il motore decide se accettare. |
| **O** - Open/Closed           | Nuovi step si aggiungono implementando `Step<TOutput>`, senza modificare il motore. Nuove condizioni si aggiungono estendendo il tipo `Condition`. La direttiva `'resolve'` non richiede modifiche al builder o agli step esistenti.        |
| **L** - Liskov Substitution   | Tutti gli step sono intercambiabili tramite l'interfaccia `Step`. Qualsiasi `Condition` e valutabile dal `ConditionEvaluator`.                                                                                                              |
| **I** - Interface Segregation | `Step` ha un'interfaccia minimale (`id`, `label`, `kind`, `execute`). `StepDescriptor` aggiunge solo le opzioni runtime necessarie. I servizi sono separati per tipo.                                                                       |
| **D** - Dependency Inversion  | Gli step dipendono da `ServiceRegistry` (astrazione), non dai client AWS concreti. Il motore dipende dall'interfaccia `Step`, non dalle implementazioni.                                                                                    |

---

## 13. Struttura Package Proposta

```
packages/
  go-runbook-engine/
    src/
      index.ts                     # Public API exports

      core/
        RunbookEngine.ts           # Orchestratore principale
        ConditionEvaluator.ts      # Valutazione condizioni

      context/
        RunbookContext.ts          # Contesto + helper immutabili

      steps/
        data/
          CloudWatchLogsQueryStep.ts
          AthenaQueryStep.ts
          DynamoDBQueryStep.ts
          HttpRequestStep.ts

        transform/
          ExtractFieldStep.ts
          RegexExtractStep.ts

        check/
          AssertStep.ts
          CompareStep.ts

        control/
          IfStep.ts
          SwitchStep.ts
          IfBranchStep.ts
          SwitchBranchStep.ts
          SetVarStep.ts
          LogStep.ts

        mutation/
          DynamoDBUpdateStep.ts
          HttpPostStep.ts

      services/
        ServiceRegistry.ts
        CloudWatchLogsService.ts
        AthenaService.ts
        HttpService.ts

      actions/
        ActionExecutor.ts
        CaseAction.ts

      builders/
        RunbookBuilder.ts          # Con validazione

      validation/
        RunbookValidationError.ts
        ValidationErrorEntry.ts
        ValidationErrorCode.ts
        GoToGraphAnalyzer.ts

      errors/
        RunbookMaxIterationsError.ts
        ErrorRecoveryInfo.ts

      trace/
        RunbookExecutionTrace.ts
        TraceBuilder.ts
        StepTrace.ts
        CaseMatchingTrace.ts
        ActionTrace.ts
        ExecutionSummary.ts
        EarlyResolutionTrace.ts

      types/
        Step.ts
        StepDescriptor.ts
        StepResult.ts
        StepKind.ts
        FlowDirective.ts
        Runbook.ts
        RunbookMetadata.ts
        RunbookType.ts
        RunbookContext.ts
        RunbookExecutionResult.ts
        KnownCase.ts
        Condition.ts
        LogEntry.ts
        TimeRange.ts
        IfBranchConfig.ts
        SwitchBranchConfig.ts

    package.json
    tsconfig.json
```

---

## 14. Secondo Esempio: Data Verification Runbook

Per dimostrare la flessibilita, ecco un runbook di tipo diverso: verifica consistenza dati su DynamoDB.
Questo esempio usa `continueOnFailure`, `ifBranch` con sub-pipeline e `maxIterations`.

```typescript
const verifyUserDataRunbook = RunbookBuilder.create('verify-user-data-consistency')
  .metadata({
    name: 'User Data Consistency Check',
    description: 'Verifica consistenza dati utente tra tabelle DynamoDB',
    version: '2.0.0',
    type: 'data-verification',
    team: 'GO',
    tags: ['dynamodb', 'data-consistency', 'verification'],
  })

  // Limite iterazioni
  .maxIterations(100)

  // -- STEP 1: Query tabella principale utenti --
  .step(
    queryDynamoDB({
      id: 'query-users-table',
      label: 'Query tabella utenti',
      tableName: 'pn-Users',
      keyCondition: 'userId = :uid',
      expressionValues: { ':uid': '{{params.userId}}' },
    }),
  )

  // -- STEP 2: Verifica esistenza utente con sub-pipeline --
  .ifBranch({
    id: 'check-user-exists',
    label: 'Verifica esistenza utente',
    condition: { type: 'exists', ref: 'steps.query-users-table.output[0]' },
    thenSteps: [
      // Sub-pipeline THEN: utente trovato, estrai dati
      extractField({
        id: 'extract-email',
        label: 'Estrai email utente',
        fromStep: 'query-users-table',
        fieldPath: '[0].email',
        saveAs: 'userEmail',
      }),
      extractField({
        id: 'extract-fiscal-code',
        label: 'Estrai codice fiscale utente',
        fromStep: 'query-users-table',
        fieldPath: '[0].fiscalCode',
        saveAs: 'userFiscalCode',
      }),
    ],
    elseSteps: [
      // Sub-pipeline ELSE: utente non trovato
      setVar({
        id: 'user-not-found',
        label: 'Utente non trovato',
        varName: 'diagnosis',
        expression: 'USER_NOT_FOUND',
      }),
      log({
        id: 'log-user-not-found',
        label: 'Log utente non trovato',
        level: 'warn',
        message: 'Utente {{params.userId}} non trovato nella tabella pn-Users',
      }),
    ],
  })

  // -- STEP 3: Query tabella notifiche --
  // continueOnFailure: anche se la query fallisce, vogliamo provare la tabella indirizzi
  .step(
    queryDynamoDB({
      id: 'query-notifications-table',
      label: 'Query tabella notifiche',
      tableName: 'pn-Notifications',
      indexName: 'userId-index',
      keyCondition: 'userId = :uid',
      expressionValues: { ':uid': '{{params.userId}}' },
    }),
    { continueOnFailure: true },
  )

  // -- STEP 4: Query tabella indirizzi --
  // continueOnFailure: non bloccante, la verifica puo proseguire
  .step(
    queryDynamoDB({
      id: 'query-addresses-table',
      label: 'Query tabella indirizzi',
      tableName: 'pn-Addresses',
      keyCondition: 'userId = :uid',
      expressionValues: { ':uid': '{{params.userId}}' },
    }),
    { continueOnFailure: true },
  )

  // -- STEP 5: Verifica consistenza con switch su risultati --
  .switchBranch({
    id: 'check-consistency-type',
    label: 'Determina tipo di verifica consistenza',
    ref: 'vars.diagnosis',
    cases: new Map<string, readonly Step[]>([
      [
        'USER_NOT_FOUND',
        [
          setVar({
            id: 'set-final-not-found',
            label: 'Diagnosi finale: utente non trovato',
            varName: 'finalDiagnosis',
            expression: 'USER_NOT_FOUND_IN_PRIMARY_TABLE',
          }),
        ],
      ],
    ]),
    defaultSteps: [
      compare({
        id: 'check-email-consistency',
        label: 'Verifica consistenza email',
        left: 'vars.userEmail',
        operator: '==',
        right: 'steps.query-notifications-table.output[0].recipientEmail',
        saveAs: 'emailConsistent',
      }),
      setVar({
        id: 'set-final-diagnosis',
        label: 'Imposta diagnosi finale',
        varName: 'finalDiagnosis',
        expression: 'CONSISTENCY_CHECK_COMPLETE',
      }),
    ],
  })

  // -- Casi noti --
  .knownCase({
    id: 'data-consistent',
    description: 'Dati utente consistenti tra le tabelle',
    priority: 10,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.emailConsistent', operator: '==', value: 'true' },
        { type: 'compare', ref: 'vars.finalDiagnosis', operator: '==', value: 'CONSISTENCY_CHECK_COMPLETE' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message: 'Dati consistenti per utente {{params.userId}}',
    },
  })

  .knownCase({
    id: 'data-inconsistent',
    description: 'Email non corrispondente tra tabelle',
    priority: 8,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.emailConsistent', operator: '==', value: 'false' },
        { type: 'compare', ref: 'vars.finalDiagnosis', operator: '==', value: 'CONSISTENCY_CHECK_COMPLETE' },
      ],
    },
    action: {
      type: 'composite',
      actions: [
        {
          type: 'notify',
          channel: 'slack:#go-data-issues',
          template: 'Inconsistenza email per utente {{params.userId}}: Users={{vars.userEmail}}',
        },
        {
          type: 'escalate',
          team: 'GO',
          severity: 'medium',
          message: 'Correzione manuale necessaria per utente {{params.userId}}',
        },
      ],
    },
  })

  .knownCase({
    id: 'user-missing',
    description: 'Utente non trovato nella tabella principale',
    priority: 5,
    condition: {
      type: 'compare',
      ref: 'vars.finalDiagnosis',
      operator: '==',
      value: 'USER_NOT_FOUND_IN_PRIMARY_TABLE',
    },
    action: {
      type: 'escalate',
      team: 'GO',
      severity: 'high',
      message: 'Utente {{params.userId}} non trovato in pn-Users',
    },
  })

  // Caso per errori recuperati
  .knownCase({
    id: 'partial-check-with-errors',
    description: 'Verifica parziale: alcune query sono fallite ma con recovery',
    priority: 2,
    condition: {
      type: 'exists',
      ref: 'vars.recoveredErrorCount',
    },
    action: {
      type: 'notify',
      channel: 'slack:#go-data-issues',
      template: 'Verifica parziale per {{params.userId}}: alcune tabelle non accessibili',
    },
  })

  .fallback(
    escalateAction({
      team: 'GO',
      severity: 'medium',
      message: 'Verifica non conclusiva per utente {{params.userId}}',
    }),
  )

  .build();
```

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

| Caratteristica            | Come viene realizzata                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Flessibilita**          | Step componibili come mattoncini. Qualsiasi combinazione e possibile.                                                                   |
| **Estensibilita**         | Nuovo step = nuova classe che implementa `Step<T>`. Nessuna modifica al motore.                                                         |
| **Controllo flusso**      | `IfStep`, `SwitchStep`, `FlowDirective.goTo` per branching condizionale. Sub-pipeline annidate per branching complesso.                 |
| **Early Resolution**      | Direttiva `'resolve'` permette la terminazione anticipata della pipeline, risparmiando step inutili.                                    |
| **Type safety**           | Generics su `Step<TOutput>` e `StepResult<TOutput>`. Contesto tipizzato. `StepDescriptor` per opzioni runtime.                          |
| **Immutabilita**          | Contesto mai mutato. Ogni step produce un nuovo stato. Sub-pipeline con contesto figlio isolato.                                        |
| **Testabilita**           | `ServiceRegistry` iniettato -> facile mocking. Step testabili isolatamente.                                                             |
| **Leggibilita**           | Builder fluent per definire runbook. Factory functions per gli step.                                                                    |
| **Domain-specific**       | Step e azioni pensati per operazioni reali (CloudWatch, DynamoDB, notifiche).                                                           |
| **Resilienza**            | `continueOnFailure` per step non critici. Errori recuperati tracciati nel contesto.                                                     |
| **Sicurezza**             | Validazione statica nel builder. Protezione anti-loop a runtime. Rilevamento cicli nel grafo.                                           |
| **Separazione interessi** | Lo step segnala `'resolve'` (conosce il suo dominio), il motore valuta i casi noti (conosce le regole). Nessuna duplicazione di logica. |
| **Retrocompatibilita**    | Step esistenti funzionano senza modifiche. `'resolve'` e opzionale, il default rimane `'continue'`.                                     |

---

## 17. Validazione, Resilienza, Anti-loop e SubPipeline

Questa sezione documenta nel dettaglio validazione nel builder, continueOnFailure, protezione anti-loop e branching annidato.

### 17.1 Validazione nel Builder

La validazione viene eseguita automaticamente da `build()` e puo essere invocata manualmente con `validate()`.

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
4. **DUPLICATE_STEP_ID**: due o piu step con lo stesso ID
5. **INVALID_GOTO_REF**: un `goTo` punta a uno step ID inesistente
6. **LOOP_DETECTED**: il grafo dei `goTo` contiene cicli
7. **DUPLICATE_CASE_ID**: due o piu KnownCase con lo stesso ID
8. **DUPLICATE_CASE_PRIORITY**: due o piu KnownCase con la stessa priorita

Il rilevamento cicli usa **DFS con colorazione** (White/Gray/Black) sul grafo di adiacenza costruito dagli archi sequenziali (`step[i] -> step[i+1]`) e dai `goTo` espliciti. Quando un nodo GRAY viene incontrato durante il DFS, il ciclo viene estratto dallo stack del path corrente.

### 17.2 continueOnFailure per Step

Il flag `continueOnFailure` permette di contrassegnare step non critici: se falliscono, l'errore viene registrato nel contesto ma l'esecuzione prosegue allo step successivo.

#### Interfacce aggiornate

```typescript
/**
 * Descrittore di uno step con opzioni di esecuzione.
 */
interface StepDescriptor<TOutput = unknown> {
  /** Lo step da eseguire */
  readonly step: Step<TOutput>;
  /**
   * Se true, un fallimento dello step non interrompe l'esecuzione.
   * L'errore viene registrato in context.recoveredErrors e lo step
   * produce un StepResult con success=false e errorRecovery valorizzato.
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
  /** Indica che lo step e stato saltato e l'esecuzione e continuata */
  readonly skipped: true;
}
```

### 17.3 Protezione anti-loop

Il motore include due meccanismi di protezione contro i loop infiniti:

1. **maxIterations**: contatore che limita il numero totale di iterazioni del ciclo while principale
2. **Rilevamento cicli a runtime**: analisi della sequenza degli step visitati per identificare pattern ripetuti

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

### 17.4 Branching annidato (SubPipeline)

Le sub-pipeline permettono di definire branching complesso inline, senza usare `goTo`. Le pipeline figlie vengono eseguite in un contesto isolato che poi si fonde nel contesto padre.

#### Interfacce per IfBranch

```typescript
/**
 * Configurazione per un IfBranchStep con sub-pipeline annidate.
 * Alternativa a IfStep con goTo: le pipeline then/else vengono eseguite inline.
 */
interface IfBranchConfig {
  /** ID univoco dello step */
  readonly id: string;
  /** Etichetta leggibile */
  readonly label: string;
  /** Condizione da valutare */
  readonly condition: Condition;
  /** Step da eseguire se la condizione e vera */
  readonly thenSteps: readonly Step[];
  /** Step da eseguire se la condizione e falsa (opzionale) */
  readonly elseSteps?: readonly Step[];
}

/**
 * Configurazione per un SwitchBranchStep con sub-pipeline annidate.
 * Alternativa a SwitchStep con goTo: le pipeline per ogni caso
 * vengono eseguite inline.
 */
interface SwitchBranchConfig {
  /** ID univoco dello step */
  readonly id: string;
  /** Etichetta leggibile */
  readonly label: string;
  /** Riferimento al valore da valutare nel contesto */
  readonly ref: string;
  /** Mappa valore -> sub-pipeline da eseguire */
  readonly cases: ReadonlyMap<string, readonly Step[]>;
  /** Sub-pipeline da eseguire se nessun caso corrisponde (opzionale) */
  readonly defaultSteps?: readonly Step[];
}
```

---

## 18. Step Signals e Early Resolution

Questa sezione documenta nel dettaglio il meccanismo di step signals e early resolution.

### 18.1 Il Problema

Senza early resolution, il motore esegue **tutti** gli step della pipeline prima di valutare i casi noti. Questo produce esecuzioni inefficienti quando la causa radice viene identificata a meta pipeline:

```
Step 1: Query CloudWatch (1800ms)     -- necessario
Step 2: Check risultati (1ms)          -- necessario
Step 3: Extract status code (1ms)      -- necessario
Step 4: Extract traceId (1ms)          -- necessario
Step 5: Extract errorCode (1ms)        -- trova RATE_LIMIT, causa nota!
Step 6: Query downstream (1800ms)      -- INUTILE, la causa e gia chiara
Step 7: Extract slow service (1ms)     -- INUTILE
Step 8: Set diagnosis (1ms)            -- INUTILE
--- Fine pipeline, ora valuta i casi noti ---
```

Totale senza early resolution: ~3600ms. Con early resolution: ~1800ms (risparmio ~50%).

### 18.2 La Soluzione: FlowDirective `'resolve'`

Il tipo `FlowDirective` include il valore `'resolve'`:

```typescript
type FlowDirective = 'continue' | 'stop' | 'resolve' | { readonly goTo: string };
```

Quando uno step restituisce `next: 'resolve'` nel suo `StepResult`:

1. Il motore aggiorna il contesto con le variabili dello step
2. Il motore valuta **tutti** i `knownCases` contro il contesto corrente
3. Se un caso corrisponde: la pipeline si interrompe (early resolution riuscita)
4. Se nessun caso corrisponde: lo step successivo viene eseguito (early resolution fallita)

### 18.3 Esempio di Step che usa `'resolve'`

```typescript
/**
 * Step di analisi dei log di un servizio.
 * Quando trova un messaggio di errore significativo, segnala 'resolve'
 * per tentare una risoluzione anticipata.
 */
class AnalyzeServiceLogsStep implements Step<ServiceLogsAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  constructor(private readonly config: AnalyzeServiceLogsConfig) {
    this.id = config.id;
    this.label = config.label;
  }

  async execute(context: RunbookContext): Promise<StepResult<ServiceLogsAnalysis>> {
    const logs = context.stepResults.get(this.config.fromStep) as readonly LogEntry[];
    const analysis = this.analyzeLogs(logs);

    if (analysis.errorMessage !== '') {
      // Trovato un errore significativo: segnala 'resolve'
      // Il motore valutera i casi noti. Se uno matcha, la pipeline si ferma.
      // Se nessuno matcha, si prosegue normalmente.
      return {
        success: true,
        output: analysis,
        vars: {
          errorMessage: analysis.errorMessage,
          errorCount: String(analysis.logCount),
          nextService: analysis.nextService,
          nextTraceId: analysis.nextTraceId,
        },
        next: 'resolve',
      };
    }

    // Nessun errore trovato: prosegui normalmente
    return {
      success: true,
      output: analysis,
      vars: {
        errorMessage: '',
        errorCount: '0',
      },
      // next omesso: default 'continue'
    };
  }

  private analyzeLogs(logs: readonly LogEntry[]): ServiceLogsAnalysis {
    // ... logica di analisi ...
  }
}
```

### 18.4 Retrocompatibilita

La direttiva `'resolve'` e completamente retrocompatibile con gli step esistenti:

| Aspetto               | Impatto                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Step esistenti**    | Funzionano senza modifiche. Il default di `next` rimane `'continue'`.                                                              |
| **FlowDirective**     | Il tipo e esteso con `'resolve'`, non modificato. `'continue'`, `'stop'` e `{ goTo }` funzionano come prima.                       |
| **KnownCases**        | La valutazione finale avviene come prima se non c'e stata early resolution.                                                        |
| **Runbook interface** | Nessuna modifica.                                                                                                                  |
| **RunbookBuilder**    | Nessuna modifica. Il segnale `'resolve'` viene dallo step, non dalla configurazione.                                               |
| **StepDescriptor**    | Nessuna modifica.                                                                                                                  |
| **Trace**             | Nuovi campi opzionali (`earlyResolution` su StepTrace, `resolvedEarly` su CaseMatchingTrace). I consumatori esistenti li ignorano. |

### 18.5 Quando usare `'resolve'`

| Tipo di step                              | Usa `'resolve'`?                   | Motivazione                                                  |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| **Data steps** (`kind: 'data'`)           | Mai                                | Raccolgono dati grezzi, non analizzano                       |
| **Transform steps** (`kind: 'transform'`) | Si, quando trovano un pattern      | Analizzano i dati e identificano anomalie                    |
| **Check steps** (`kind: 'check'`)         | Si, quando confermano una diagnosi | Verificano condizioni che possono essere conclusive          |
| **Control steps** (`kind: 'control'`)     | Raramente                          | Il branching serve per dirigere il flusso, non per risolvere |
| **Mutation steps** (`kind: 'mutation'`)   | Mai                                | Le mutazioni si eseguono dopo la risoluzione, non prima      |
