# Risoluzione dei Token Statici nei Pattern CloudWatch

> **Data:** 2026-11-25  
> **Script:** `go-report-error-patterns`

---

## 1. Panoramica e Obiettivo

Durante l'analisi dei log tramite AWS CloudWatch Logs Insights, il comando `pattern <campo>` raggruppa le righe simili identificando le parti variabili mediante il segnaposto `<*>`. Tuttavia, CloudWatch classifica come variabili anche elementi lessicalmente dinamici (come numeri, codici HTTP, ID o percorsi) che, nel contesto specifico dell'attivazione dell'allarme, potrebbero avere un valore costante.

La funzionalità di **Risoluzione dei Token Statici** (`resolveStaticTokens: true`) verifica empiricamente se ciascun segnaposto `<*>` all'interno dei pattern estratti abbia mantenuto un valore invariato durante le finestre temporali di allarme. Se un token risulta costante, il segnaposto `<*>` viene sostituito con il suo valore reale nel report finale, preservando informazioni diagnostiche essenziali (es. codici di stato HTTP stabili, tenant fissi o percorsi specifici).

---

## 2. Modello di Esecuzione: Query Dedicata per Singolo Pattern

Dato l'insieme di pattern $P_1, P_2, \dots, P_N$ individuati dalla query iniziale $Q$, il sistema **non esegue un'unica query cumulativa**, bensì **una query di risoluzione mirata per ciascun pattern $P_k$** che contiene almeno un token `<*>`.

### Motivazione tecnica
In CloudWatch Logs Insights, il comando `parse` richiede che il template di corrispondenza (glob o regex) sia una stringa letterale prefissata nel testo della query al momento dell'invocazione; non può essere calcolato dinamicamente o variato riga per riga.

Di conseguenza, **l'unico modo per misurare la stabilità dei token di un pattern senza interferenze o collisioni tra campi è isolare ciascun pattern $P_k$ nella propria query dedicata**. In questo modo, l'aggregazione statistica opera esclusivamente sulle righe di log conformi alla struttura di $P_k$, evitando ambiguità nell'estrazione delle variabili.

---

## 3. Anatomia della Query di Risoluzione Empirica dei Token per il $k$-esimo Pattern ($Q_{\text{res}}^{(k)}$)

### Notazione Formale
- **$Q$**: la query originale associata all'allarme, definita nel file di configurazione (`queryAwsCloudWatch`).
- **$CP$**: il campo target indicato nel comando `pattern <CP>` (default: `@message` se omesso).
- **$P_1, \dots, P_N$**: l'insieme degli $N$ pattern individuati dall'esecuzione di $Q$.
- **$P_k$**: il generico $k$-esimo pattern ($k \in \{1, \dots, N\}$) contenente $M_k$ token variabili `<*>`.
- **$Q_{\text{base}}$**: la porzione a monte di $Q$ depurata dai comandi incompatibili con l'aggregazione `stats` (si veda la [Sezione 4](#4-estrazione-della-pipeline-a-monte-q_textbase)).
- **$Q_{\text{res}}^{(k)}$**: la query di risoluzione mirata generata per il pattern $P_k$.

### Struttura della Query $Q_{\text{res}}^{(k)}$
La query $Q_{\text{res}}^{(k)}$ viene generata secondo la seguente struttura in sintassi CloudWatch Logs Insights:

```text
<Q_base>
| parse CP "<P_k con * al posto di <*>>" as t1, t2, ..., tM_k
| filter ispresent(t1)
| stats count_distinct(t1) as cd1, earliest(t1) as v1,
        count_distinct(t2) as cd2, earliest(t2) as v2,
        ...
        count_distinct(tM_k) as cdM_k, earliest(tM_k) as vM_k
```

> [!NOTE]
> **Approfondimento funzioni CloudWatch**  
> Per la spiegazione dettagliata del comando `stats`, delle funzioni di aggregazione `count_distinct` ed `earliest` e della funzione condizionale `ispresent`, si rimanda all'[Appendice A.2](#appendice-a2-keyword-stats-count_distinct-earliest-e-funzione-ispresent).

---

## 4. Estrazione della Pipeline a Monte ($Q_{\text{base}}$)

### 4.1 Incompatibilità tecnica della query originale $Q$ con `stats`
La query di configurazione $Q$ non può essere riutilizzata tal quale per verificare la stabilità dei token. L'aggiunta di una clausola di aggregazione `stats` in coda a $Q$ fallirebbe o produrrebbe risultati errati per i seguenti motivi:
- Il comando originale `pattern CP` aggrega già i log in gruppi di pattern; non è possibile innestare un `parse` o uno `stats` a valle di un altro comando `pattern`.
- L'istruzione `display` nasconde i campi non esplicitamente inclusi, rendendo inaccessibile il campo $CP$ (specialmente se calcolato/sintetico) per il successivo comando `parse`.
- L'ordinamento `sort` comporterebbe un costo computazionale inutile, poiché `stats` opera sull'intero insieme aggregato e la funzione `earliest()` individua nativamente il record più remoto.
- Il comando `limit` troncherebbe l'insieme dei log a un sottoinsieme arbitrario, alterando e falsando il valore restituito da `count_distinct`.

Per consentire la risoluzione dei token è quindi necessario estrarre da $Q$ la sola pipeline di preparazione dei log, definita come **$Q_{\text{base}}$**, su cui innestare il **blocco di risoluzione** (ovvero la sequenza `parse | filter ispresent | stats`).

### 4.2 Comandi Mantenuti in $Q_{\text{base}}$
- **`filter`**: tutti i filtri a monte dell'allarme (es. `filter status like /5../`, filtri su pod, namespace, ecc.) rimangono attivi per isolare rigorosamente il perimetro dei log di errore.
- **`fields`**: trasformazioni e proiezioni, compresa la generazione di campi sintetici (es. `fields concat(sourceIp, " - ", status, " - ", requestPath) as msg`).
- **`parse`**: eventuali estrazioni intermedie eseguite prima del comando `pattern`.

### 4.3 Comandi Rimossi da $Q$
- **`pattern CP`**: rimosso e sostituito dal blocco di risoluzione.
- **`display`**: rimosso per garantire la visibilità di tutti i campi intermedi e prevenire conflitti sintattici con `stats`.
- **`sort`**: rimosso per ottimizzare le prestazioni di esecuzione della query su CloudWatch.
- **`limit`**: rimosso per garantire che il conteggio `count_distinct` consideri la totalità dei log pertinenti nella finestra temporale.

### 4.4 Garanzia di Coerenza di Contesto
Grazie all'estrazione di $Q_{\text{base}}$, la query $Q_{\text{res}}^{(k)}$ opera esattamente sullo stesso insieme di dati, con i medesimi filtri e con gli stessi campi derivati utilizzati dalla ricerca iniziale, garantendo la totale coerenza dell'analisi.

---

## 5. Esempio Pratico End-to-End

### Configurazione di partenza
- **Query iniziale $Q$**:
  ```text
  filter apigwId = "xyz123"
  | filter status like /5../
  | fields concat(sourceIp, " - ", status, " - ", requestPath) as msg
  | display log
  | pattern msg
  ```
- **Campo target ($CP$)**: `msg`
- **Pattern $P_1$ individuato da $Q$**:
  ```text
  <*> - 504 - /api/v1/payments/<*>
  ```
  *(Presenta $M_1 = 2$ token variabili: $t_1$ corrisponde all'IP sorgente e $t_2$ al sotto-percorso della richiesta).*

### Query di risoluzione generata $Q_{\text{res}}^{(1)}$
Dalla query $Q$ viene estratta la pipeline $Q_{\text{base}}$ (rimuovendo `display log` e `pattern msg`) e viene appeso il blocco di risoluzione:

```text
filter apigwId = "xyz123"
| filter status like /5../
| fields concat(sourceIp, " - ", status, " - ", requestPath) as msg
| parse msg "* - 504 - /api/v1/payments/*" as t1, t2
| filter ispresent(t1)
| stats count_distinct(t1) as cd1, earliest(t1) as v1, count_distinct(t2) as cd2, earliest(t2) as v2
```

---

## 6. Algoritmo di Valutazione della Stabilità

L'esecuzione della query $Q_{\text{res}}^{(k)}$ su una specifica finestra temporale restituisce una singola riga di metriche aggregate contenente le coppie $(cd_i, v_i)$ per ciascun token $i \in \{1, \dots, M_k\}$:
- **$cd_i$** (*Count Distinct*, prodotto da `count_distinct(t_i)`): rappresenta il numero totale di valori univoci e distinti assunti dal token $t_i$ in tutte le righe di log che hanno fatto match con il pattern durante la finestra temporale considerata.
- **$v_i$** (*Value*, prodotto da `earliest(t_i)`): rappresenta il valore assunto dal token $t_i$ nel primo log in ordine cronologico. Se il token non varia ($cd_i = 1$), $v_i$ rappresenta a tutti gli effetti l'unico valore costante assunto dal token.

La classificazione di un token come **stabile** avviene su due livelli gerarchici:

### 6.1 Livello Intra-Occorrenza (Finestra Temporale della $j$-esima Occorrenza)
Sia $j \in \{1, \dots, J\}$ l'indice della specifica occorrenza di attivazione dell'allarme analizzata:
- Se **$cd_i = 1$**: il token non ha mai subito variazioni durante l'occorrenza $j$. Il valore costante osservato è **$v_i$**.
- Se **$cd_i > 1$**: il token ha assunto valori differenti (es. richieste originate da IP diversi o endpoint con parametri variabili) $\rightarrow$ il token è **variabile** e rimane `<*>`.
- Se **$cd_i = 0$** o il campo è assente/nullo: il token non è risolvibile $\rightarrow$ rimane `<*>`.

### 6.2 Livello Cross-Occorrenza (Tutte le $J$ Occorrenze dell'Allarme)
Se l'allarme si è attivato $J$ volte nell'intervallo storico monitorato, il token $t_i$ è promosso a stabile nel report finale **se e solo se**:
1. È risultato stabile ($cd_i = 1$) in **tutte** le occorrenze $j \in \{1, \dots, J\}$ in cui il pattern $P_k$ si è manifestato.
2. Ha registrato **lo stesso identico valore $v_i$** in ciascuna di esse.

> **Esempio:**  
> Se nell'occorrenza $j = 1$ si osserva $t_1 = \text{"10.0.0.1"}$ con $cd_1 = 1$, ma nell'occorrenza $j = 2$ si osserva $t_1 = \text{"10.0.0.2"}$ con $cd_1 = 1$, il token è localmente stabile nelle singole finestre ma globalmente variabile tra le diverse attivazioni. Pertanto, nel report finale $t_1$ rimarrà `<*>`.

---

## 7. Ricomposizione Posizionale del Pattern

Quando uno o più token risultano stabili, il pattern risolto viene ricomposto tramite splitting posizionale sul marcatore `<*>`:

```typescript
const parts = pattern.split('<*>');
let reconstructed = parts[0];
for (let i = 0; i < tokenCount; i++) {
  const value = stableValues.get(i);
  reconstructed += (value !== undefined ? value : '<*>') + parts[i + 1];
}
```

Questo approccio garantisce:
- Sostituzione sicura basata sull'indice esatto del token, senza incorrere negli effetti collaterali delle sostituzioni sequenziali tramite string replacement.
- Preservazione dei token che rimangono variabili nella forma `<*>`.

---

## 8. Appendice

### Appendice A.1: Template Glob in CloudWatch `parse`
In AWS CloudWatch Logs Insights, il comando `parse` supporta due modalità di estrazione: espressioni regolari (tramite delimitatori `//`) e **template glob** (stringhe racchiuse tra doppi apici `""` o singoli apici `''`).

Un **template glob** è una stringa di pattern matching che utilizza uno o più caratteri jolly `*` (asterisco) per catturare porzioni di testo e associarle a variabili nominate specificate nella clausola `as <var1>, <var2>, ...`.

- **Funzionamento:** CloudWatch confronta la stringa di log da sinistra a destra: le porzioni di testo letterali devono corrispondere esattamente, mentre ciascun `*` cattura i caratteri intermedi fino al delimitatore letterale successivo.
- **Esempio:**  
  ```text
  parse @message "Status: * - Error: *" as httpStatus, errorMsg
  ```
- **Riferimento documentazione AWS:**  
  - [AWS CloudWatch Logs Insights - Sintassi del comando parse](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html#CWL_QuerySyntax-parse)
  - [Esempi di utilizzo del comando parse in CloudWatch Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-examples.html#CWL_QuerySyntax-parse-examples)

### Appendice A.2: Keyword `stats`, `count_distinct`, `earliest` e Funzione `ispresent`
Il comando `stats` calcola funzioni aggregate sui log restituiti dalla pipeline di query.

- **`stats`**: parola chiave che avvia il blocco di aggregazione dei dati. Raggruppa i log e genera righe di riepilogo con i valori calcolati dalle funzioni specificate.
- **`count_distinct(campo)`**: funzione di aggregazione che restituisce il numero di valori univoci e distinti assunti dal campo indicato (ignorando i record nulli o assenti).  
  *Nel nostro contesto:* se $cd_i = \text{count\_distinct}(t_i) = 1$, indica che il token $t_i$ non ha subito alcuna variazione durante l'intervallo temporale analizzato, qualificandosi come empiricamente stabile.
- **`earliest(campo)`**: funzione di aggregazione che restituisce il valore del campo specificato relativo al log con il timestamp temporale più remoto (il primo in ordine cronologico) tra quelli considerati.  
  *Nel nostro contesto:* permette di estrarre in modo deterministico ed efficiente il valore reale del token stabile, evitando la necessità di ordinare preliminarmente l'intero set di dati con `sort`.
- **`ispresent(campo)`**: funzione condizionale booleana che restituisce `true` se il campo specificato esiste ed è valorizzato (non nullo) nella riga di log.  
  *Nel nostro contesto:* `filter ispresent(t1)` è fondamentale perché fa sì che l'aggregazione `stats` consideri esclusivamente le righe di log che hanno fatto effettivo match con il template di $P_k$ (per le righe non conformi al template glob, il comando `parse` lascia indefinito il campo $t_1$).
- **Riferimento documentazione AWS:**  
  - [AWS CloudWatch Logs Insights - Comando stats e funzioni di aggregazione](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-stats.html)
  - [AWS CloudWatch Logs Insights - Funzioni di supporto e operatori](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)
