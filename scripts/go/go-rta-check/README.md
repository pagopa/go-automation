# go-rta-check

Confronta l'esecuzione dei **runbook** di `go-analyze-alarm` con le **analisi Watchtower**, su tutte le occorrenze in cui un allarme è scattato in un periodo.

Per ogni occorrenza esegue **due verifiche**:

- **V1 — copertura runbook** (deterministica): `HIT` / `MISS` / `NO-DATA` / `CONFIG-ERROR` / `EXECUTION-ERROR`.
- **V2 — coerenza con l'analisi** (assistita): `MATCH_EXACT` / `MATCH_STRONG` / `MATCH_WEAK` / `NO_EVIDENCE` / `CONFLICT` / `NOT_LINKED` / `IGNORED` / `NOT_ANALYZED`, con segnali e motivazioni (incl. overlap `traceId`/`requestId`). Di default usa GO-AI `semantic-match`; `--analysis-matcher lexical` forza il matcher lessicale storico.

### Significato degli stati

**V1 — Esito (copertura del runbook)**

| Esito             | Significato                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HIT`             | Un caso noto del runbook ha matchato l'errore.                                                                                                    |
| `MISS`            | Log/errori presenti e analizzati, ma **nessun caso noto** li ha riconosciuti → caso azionabile: **runbook da arricchire**.                        |
| `NO-DATA`         | Query valida ma **0 record** (retention scaduta o finestra senza log): nessun errore da analizzare. Atteso, non penalizzante.                     |
| `CONFIG-ERROR`    | La query non parte per **configurazione**: log group inesistente, account/profilo AWS errato, permessi mancanti (spesso runbook mal configurato). |
| `EXECUTION-ERROR` | Crash o errore **non recuperabile** durante l'esecuzione del runbook.                                                                             |

> `MISS` vs `NO-DATA`: `MISS` = "c'erano errori e il runbook non li ha riconosciuti"; `NO-DATA` = "non c'erano errori/log". Solo `MISS` indica un buco da colmare.

**V2 — Verifica (coerenza con l'analisi Watchtower, assistita)**

| Verifica       | Significato                                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MATCH_EXACT`  | `traceId`/`requestId` in comune, oppure id/descrizione del caso citati nell'analisi.                                                                                                                             |
| `MATCH_STRONG` | Segnali forti concordi (downstream / keyword / descrizione), score alto.                                                                                                                                         |
| `MATCH_WEAK`   | Solo segnali deboli concordi.                                                                                                                                                                                    |
| `NO_EVIDENCE`  | Analisi collegata ma testo insufficiente/non correlabile, **oppure** il runbook non ha rilevato un caso da confrontare.                                                                                          |
| `CONFLICT`     | Categoria d'errore divergente, oppure GO-AI segnala una divergenza semantica forte con score molto basso.                                                                                                        |
| `NOT_LINKED`   | Occorrenza **senza analisi** collegata.                                                                                                                                                                          |
| `IGNORED`      | Analisi collegata e classificata `IGNORABLE`: esiste, ma non è usata come oracolo (salvo `--include-ignorable`). La cella "Verifica" riporta tra parentesi il codice del motivo, es. `IGNORED (FALSE_POSITIVE)`. |
| `NOT_ANALYZED` | Analisi collegata ma non ancora `COMPLETED` → non usata come oracolo (salvo `--include-incomplete`).                                                                                                             |

> `IGNORED` e `NOT_ANALYZED` distinguono due situazioni diverse: nel primo caso
> l'analisi **c'è ed è conclusa** (l'occorrenza è stata deliberatamente marcata
> come ignorabile), nel secondo l'analisi è ancora in lavorazione. Il codice tra
> parentesi è `ignoreReasonCode` di Watchtower; se assente si ricade sulla label
> leggibile del motivo. Per queste righe il suffisso del matcher viene omesso:
> nessun confronto è stato eseguito.

Vedi `docs/evolutions/EVO-RTACHECK-OPUS-02.md` per il design completo.

## Modalità

`--mode` sceglie cosa esegue lo script: le tre modalità rispondono a domande diverse.

| Mode                 | Cosa fa                                                                                                                                      | AWS                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `analyses` (default) | Il confronto esecuzioni ↔ analisi descritto sopra: esegue i runbook sulle occorrenze e classifica V1/V2.                                     | Sì (profili `--aws-profiles`) |
| `coverage`           | Confronta i riferimenti **dichiarati** dai runbook con il censimento Watchtower del prodotto. Sola lettura, scrive un artifact di copertura. | No                            |
| `readiness`          | Gate di attivazione di `APPLY_KNOWN`: unisce la copertura statica allo **shadow osservato**. Sola lettura, output solo a console.            | No                            |

`readiness` passa solo se reggono **entrambe** le condizioni: copertura statica senza riferimenti mancanti **e**, nella finestra osservata, ogni known case valutato con `wouldApplyStatus = APPLIED`. Zero capability valutate non è un via libera: è assenza di evidenza, e l'esito resta negativo.

### Finestra dello shadow

`--readiness-window-days <n>` imposta quanti giorni indietro guardare per le valutazioni shadow: **default 14**. Vale solo con `--mode readiness`, nelle altre modalità è ignorato. Una finestra troppo corta rischia di non aver ancora incontrato i casi che contano (e l'esito diventa "assenza di evidenza"), una troppo lunga include comportamenti di versioni superate del runbook.

### Exit code e `--exit-code-on-findings`

`coverage` e `readiness` producono un **verdetto**, non solo un log:

| Exit code | Significato                                                                       |
| --------- | --------------------------------------------------------------------------------- |
| `0`       | Conforme (copertura completa / `APPLY_KNOWN` attivabile).                         |
| `1`       | Verdetto negativo: **ho misurato** e non va bene.                                 |
| `2`       | Non eseguibile: **non ho potuto misurare** (config, credenziali, rete, risposta). |

Di default il verdetto negativo **non** esce dal processo: da terminale un exit code diverso da zero fa dire a pnpm che il comando è fallito, subito dopo che lo script ha stampato il proprio esito. `--exit-code-on-findings` propaga il verdetto (`1`) ed è quello che serve in CI per fermare la pipeline. L'exit code `2` esce **sempre**, con o senza il flag: non è un'opinione sul risultato, è il fallimento del comando. In `--mode analyses` il flag non ha effetto.

Anche `analyses` usa la stessa scala, sulla distinzione **«non ho potuto» vs «non dovevo»**: una run che non è potuta partire non deve mai apparire verde in pipeline.

| Exit code | Quando                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`       | Run completata; oppure stop deliberato: `--dry-run`, conferma negata, wizard annullato dall'utente, nessuna occorrenza nel periodo.                                           |
| `2`       | Run non eseguibile: opzioni non valide, connessione/credenziali Watchtower, selezione impossibile (scope, id inesistenti, valore ambiguo senza prompt), profili AWS mancanti. |

Quando una sessione interattiva analizza più runbook di seguito (vedi [Analizzare più runbook](#analizzare-più-runbook-nella-stessa-sessione)) **vince l'esito peggiore**: un `2` al primo runbook non viene cancellato da una run successiva andata a buon fine.

Un'eccezione non gestita resta gestita da GOScript e continua a uscire diversa da zero.

```bash
# Gate in CI: fallisce la pipeline se APPLY_KNOWN non è attivabile
pnpm go:rta:check -- \
  --watchtower-url "$WATCHTOWER_BASE_URL" \
  --product-id "<uuid>" \
  --mode readiness \
  --readiness-window-days 30 \
  --exit-code-on-findings
```

## Prerequisiti

- Accesso a Watchtower con credenziali valide.
- Profili AWS SSO configurati per gli account sorgente dei log CloudWatch analizzati dai runbook.
- Profilo AWS standard per GO-AI/Bedrock quando `--analysis-matcher ai` è attivo.

## Configurazione

### Matcher AI

Il matcher AI usa `@go-automation/go-ai`, `GOBedrockClient` e il cappello `semantic-match`, descritto in `artifacts/goai.pdf`: invia due testi (`a` = esito/caso rilevato dal runbook, `b` = analisi Watchtower dell'operatore) e riceve `score`, `explanation`, `verdict`.

La chiamata GO-AI avviene solo quando serve davvero: analisi collegata e valida, runbook in `HIT`, nessun `traceId`/`requestId` o case id già deterministico. I segnali deterministici restano guardrail, mentre lo score AI sostituisce il confronto testuale lessicale.

Se la chiamata AI fallisce, lo script usa automaticamente il matcher lessicale, salvo `--go-ai-fallback-to-lexical false`. La colonna live `Verifica` indica il motore effettivo: `deterministic+ai` quando traceId/requestId o case id rendono il match esatto e GO-AI ha comunque verificato il testo operatore, `deterministic` quando il match esatto resta deterministico ma l'audit AI non ha prodotto risultato, `ai` quando il modello ha deciso il confronto, `lexical fallback` quando GO-AI ha fallito e il confronto lessicale ha sostituito l'AI, `n/a` quando la riga non è confrontabile dall'AI (per esempio `MISS`, `CONFIG-ERROR`, analisi assente/non usabile). Il riepilogo finale mostra una sezione `Errori GO-AI` e il report JSON/HTML include `aiAttempted`, `aiFallback` e `aiError`.

Esempio:

```bash
pnpm go:rta:check -- \
  --watchtower-url "$WATCHTOWER_BASE_URL" \
  --product-id "<uuid>" \
  --alarm-name "pn-...-Alarm" \
  --date-from "2026-02-01T00:00:00Z" --date-to "2026-06-04T23:59:59Z" \
  --aws-profiles "sso_pn-core-prod_readonly" \
  --analysis-matcher ai \
  --aws-profile "sso_pn-analytics"
```

Parametri principali:

| Flag                          | Default            | Significato                                                                                  |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| `--targets`                   | _(nessuno)_        | Scope prodotto→ambienti della selezione (vedi [Scope dei target](#scope-dei-target-targets)) |
| `--non-interactive`           | `false`            | Disattiva ogni prompt (vedi [Modalità non interattiva](#modalità-non-interattiva-ci))        |
| `--product-id`                | _(interattivo)_    | Fissa il prodotto e salta il primo passo                                                     |
| `--environment-id`            | _(interattivo)_    | Fissa l'ambiente e salta il secondo passo                                                    |
| `--alarm-name`                | _(interattivo)_    | Fissa il runbook e salta il terzo passo                                                      |
| `--analysis-matcher`          | `ai`               | `ai` oppure `lexical`                                                                        |
| `--concurrency`               | `1`                | Numero di occorrenze/runbook processati in parallelo                                         |
| `--output-format`             | `all`              | Artifact da scrivere: `json`, `md` o `all`                                                   |
| `--go-ai-semantic-threshold`  | `70`               | Soglia 0..100 per considerare equivalente lo score GO-AI                                     |
| `--go-ai-fallback-to-lexical` | `true`             | Se GO-AI fallisce, usa il matcher lessicale invece di marcare `NO_EVIDENCE`                  |
| `--aws-region`                | `eu-south-1`       | Regione AWS standard per credenziali/profili                                                 |
| `--aws-profile`               | `sso_pn-analytics` | Profilo AWS standard usato da GO-AI/Bedrock                                                  |

### Scope dei target (`targets`)

`targets` delimita **cosa puoi selezionare**: un'entry per prodotto, con i propri ambienti (gli ambienti appartengono al prodotto, quindi vivono dentro l'entry). Se `targets` è omesso non c'è nessun vincolo: vengono offerti tutti i prodotti leggibili con le credenziali Watchtower.

In `config.json` si usa la forma a oggetti:

```json
{
  "targets": [
    { "productId": "<uuid-send>", "environmentIds": ["<uuid-prod>", "<uuid-uat>"] },
    { "productId": "<uuid-interop>", "environmentIds": [] }
  ]
}
```

`environmentIds` vuoto (o assente) = **nessuna restrizione** su quel prodotto: tutti i suoi ambienti restano selezionabili.

Le uniche chiavi ammesse sono `productId` e `environmentIds`: una chiave sconosciuta (`product`, `environments`, …) è un **errore**, non un campo ignorato — altrimenti un refuso trasformerebbe in silenzio uno scope ristretto in uno aperto.

Da CLI serve una forma compatta, perché il parser degli array splitta sulle virgole: `productId:envId1|envId2` (il separatore degli ambienti è `|`).

```bash
--targets "<uuid-send>:<uuid-prod>|<uuid-uat>" --targets "<uuid-interop>"
```

Voci ripetute per lo stesso prodotto vengono unite (con dedup, ordine di dichiarazione preservato); un prodotto dichiarato **almeno una volta senza ambienti** resta senza restrizioni. Gli id inesistenti su Watchtower vengono segnalati con un warning e ignorati; se però **tutti** gli ambienti configurati per il prodotto scelto sono sconosciuti, il run **si ferma** invece di ripiegare su "tutti gli ambienti": uno scope invalido non deve mai allargare l'esecuzione.

#### `targets` è un confine, non un suggerimento

Lo scope vale anche per i valori fissati da flag: `--product-id` e `--environment-id` sono risolti **dentro** `targets`, non prima. Un valore fuori dal confine è un errore, non un override silenzioso.

| Caso                                                   | Esito         |
| ------------------------------------------------------ | ------------- |
| `--product-id` fuori da `targets`                      | errore + stop |
| `--environment-id` fuori da `targets`                  | errore + stop |
| `--environment-id` di un altro prodotto, o inesistente | errore + stop |
| `--alarm-name` assente dal prodotto o senza runbook    | errore + stop |

L'ultima riga vale da sempre; le altre chiudono un buco per cui un flag poteva far uscire il run dal confine configurato. In particolare un `--environment-id` non appartenente al prodotto veniva accettato e produceva zero occorrenze senza spiegazione.

Per uscire dal confine si **ridefinisce il confine**, esplicitamente: `--targets` da CLI **sostituisce** il valore di `config.json` (la CLI ha priorità più alta), quindi un test estemporaneo su un altro prodotto si scrive così:

```bash
pnpm go:rta:check -- --targets "<uuid-altro-prodotto>" --product-id "<uuid-altro-prodotto>" …
```

### Selezione interattiva: prodotto → ambiente → runbook

Quando prodotto, ambiente o allarme non sono fissati da flag, lo script guida una selezione in tre passi, con i **nomi risolti** da Watchtower:

1. **Prodotto** — solo quelli nello scope di `targets`. Se ne resta uno solo viene scelto senza chiedere.
2. **Ambiente** — solo quelli del prodotto e nello scope, più la voce `Tutti gli ambienti (n)`.
3. **Runbook** — solo gli allarmi che hanno un runbook locale nel registry, **ordinati per occorrenze reali nell'ambiente scelto**.

Ogni passo (dal secondo in poi) offre `← Indietro` per tornare alla scelta precedente; la voce non compare quando non c'è nessun passo interattivo a cui tornare. Le letture Watchtower sono memoizzate per la durata del wizard, quindi tornare indietro non ripaga le stesse chiamate — **nemmeno quelle fallite**: un conteggio che ha dato errore resta "non disponibile" e non viene ritentato a ogni passaggio.

**Perché il conteggio delle occorrenze e non un filtro sui nomi.** I runbook non sono omogenei: quelli INTEROP portano l'ambiente nel nome dell'allarme (`…-prod-…`, `…-att-…`), quelli SEND hanno un solo nome valido per **tutti** gli ambienti. Dedurre l'ambiente dal nome è inaffidabile (per esempio `k8s-interop-public-catalog-…-prod-public-catalog` appartiene all'ambiente _Catalog_, non a Produzione), quindi l'associazione allarme↔ambiente è presa dai dati: per ogni allarme testabile lo script chiede a Watchtower il numero di occorrenze **nell'ambiente selezionato** (una richiesta paginata `pageSize=1`, si legge solo `totalItems`, in parallelo con concorrenza limitata).

Il risultato ordina la lista: prima i runbook che sono scattati (più occorrenze in cima), poi quelli con conteggio non disponibile. I runbook **senza occorrenze non vengono eliminati** — un runbook SEND resta valido anche in una finestra vuota — ma sono raccolti dietro la voce `▸ Mostra anche i N runbook senza occorrenze`. Se nessun runbook ha occorrenze, il catalogo completo viene mostrato subito con un warning.

**Se il conteggio fallisce.** Un errore su una singola richiesta non blocca la selezione: il runbook resta scegliibile, marcato `· conteggio non disponibile`. Per non far passare un guasto di Watchtower per una lista di runbook mai scattati, i fallimenti sono riepilogati in **un unico warning** con il primo errore incontrato, per esempio `Conteggio non disponibile per 8 runbook su 12 (primo errore: …)`.

Selezionando `Tutti gli ambienti`: se lo scope del prodotto è aperto non viene applicato alcun filtro; se `targets` lo restringe, il filtro è la lista degli ambienti in scope (che vale sia per il conteggio sia per l'esecuzione).

### Analizzare più runbook nella stessa sessione

Al termine di ogni run lo script **non esce**: chiede cosa fare, perché rivedere più runbook di fila è il caso d'uso normale e rifare login e selezione ogni volta è tempo sprecato.

| Voce                                          | Effetto                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `Analizza un altro runbook di <prodotto>`     | Torna al passo **Runbook**, mantenendo prodotto e ambiente già scelti.           |
| `Analizza un runbook di un altro prodotto`    | Riparte dal passo **Prodotto**, cioè dal menù iniziale.                          |
| `Esci`                                        | Chiude la sessione con l'exit code accumulato.                                   |

Dettagli del comportamento:

- Login Watchtower e letture già fatte (prodotti, ambienti, allarmi, conteggi) sono **riusati**: il giro successivo parte immediato. I conteggi delle occorrenze restano quelli della sessione, non vengono rinfrescati.
- Il **periodo viene richiesto di nuovo** a ogni run, così si può cambiare finestra senza uscire; se è fissato con `--date-from` / `--date-to` resta quello.
- `Analizza un runbook di un altro prodotto` compare **solo se il prodotto era stato scelto davvero**: con un solo prodotto in scope o con `--product-id` la voce sarebbe un giro a vuoto.
- La sessione si ferma da sola quando un altro giro non potrebbe funzionare (profili AWS mancanti) e quando il wizard viene annullato.
- Anche una run che si è fermata da sola (`--dry-run`, conferma negata, nessuna occorrenza) offre il menù: è il momento in cui si vuole provare un altro runbook o un altro periodo.
- Il menù **non compare mai** in [modalità non interattiva](#modalità-non-interattiva-ci) né con `--alarm-name` fissato: una domanda senza risposta bloccherebbe il processo, e con il runbook fissato ogni giro sarebbe identico al precedente.

### Modalità non interattiva (CI)

Il wizard **non chiede mai** quando vale una di queste condizioni:

- `--non-interactive` (alias `-ni`) — l'unico interruttore esplicito e affidabile;
- **stdin non è un TTY** — nessuna risposta potrebbe mai arrivare;
- `--alarm-name` **e** `--date-from` entrambi presenti — la convenzione flag-driven storica, preservata per non rompere le invocazioni esistenti.

In quella modalità i tre passi si comportano così:

| Passo    | Se non è fissato da flag                                                            |
| -------- | ----------------------------------------------------------------------------------- |
| Prodotto | **Errore + stop**: passa `--product-id` o restringi `targets` a un solo prodotto    |
| Ambiente | **Tutti**: nessun filtro se lo scope è aperto, tutti quelli in scope se è ristretto |
| Runbook  | **Errore + stop**: passa `--alarm-name`                                             |

L'asimmetria è voluta: l'ambiente omesso ha un default documentato ("tutti"), prodotto e runbook no — e in CI fallire con un messaggio è sempre meglio che restare appesi a un prompt.

Lo stesso vale per le domande che seguono la selezione: `--date-from` / `--date-to` omessi valgono "nessun limite" senza chiedere, e la conferma prima dell'esecuzione è implicita (era già così con la convenzione flag-driven).

Ogni «Errore + stop» esce con **exit code 2** (vedi [Exit code](#exit-code-e---exit-code-on-findings)): in pipeline uno scope sbagliato fallisce il job invece di passare in silenzio.

## Utilizzo

Interattiva (selezione prodotto/ambiente/runbook/periodo):

```bash
pnpm go:rta:check -- \
  --watchtower-url "$WATCHTOWER_BASE_URL" \
  --aws-profiles "sso_pn-core-prod_readonly"
# email/password: --watchtower-email / --watchtower-password, env (gestita da GOScript) o prompt
# lo scope dei prodotti/ambienti proposti arriva da `targets` (config.json o --targets)
```

Non interattiva / CI:

```bash
pnpm go:rta:check -- \
  --watchtower-url "$WATCHTOWER_BASE_URL" \
  --non-interactive \
  --product-id "<uuid>" \
  --environment-id "<uuid>" \
  --alarm-name "pn-...-LogInvocationErrors-Alarm" \
  --date-from "2026-02-01T00:00:00Z" --date-to "2026-06-04T23:59:59Z" \
  --aws-profiles "sso_pn-core-prod_readonly,sso_pn-confinfo-prod" \
  --limit 50
```

Anteprima senza eseguire AWS:

```bash
pnpm go:rta:check -- --watchtower-url "$WATCHTOWER_BASE_URL" --product-id "<uuid>" \
  --alarm-name "pn-...-Alarm" --date-from "..." --date-to "..." --dry-run
```

## Cache (resume)

Per non ripagare ogni volta le query CloudWatch, l'esito del **runbook (V1)** di ogni occorrenza viene salvato su disco e riusato nelle run successive.

### Come funziona

- **Cosa viene cachato**: solo l'`RunbookOutput` (la parte costosa che interroga CloudWatch Logs Insights). Un file JSON per occorrenza.
- **Dove**: `data/go-rta-check/cache/runbook/<alarmName>/<eventId>.json`, risolto tramite il path system standard di GOScript (`GOPathType.CACHE`): rispetta quindi gli override `GO_DATA_DIR` / `GO_CACHE_DIR`. `<alarmName>` è sanitizzato (i caratteri fuori da `[a-zA-Z0-9._-]` diventano `_`).
- **Chiave**: la coppia `(alarmName, eventId)`. `eventId` è l'id dell'occorrenza su Watchtower, univoco per ogni scatto dell'allarme.
- **Fingerprint (validità)**: ogni entry è un envelope `{ fingerprint, meta, output }`. Il `fingerprint` è l'hash di tutto ciò che può cambiare l'esito V1: `fingerprintVersion` (leva locale), **id + versione del runbook**, **hash strutturale della definizione runbook** (known case, step, …), versione schema di `RunbookOutput`, **profili AWS + region** e **finestra temporale** (`firedAt` + minuti). L'entry viene riusata **solo se il fingerprint coincide** con quello ricalcolato al momento; per calcolarlo il runbook viene ricostruito dal registry (operazione pura, senza AWS).
- **Cosa NON viene cachato**: la **V2** (confronto con l'analisi Watchtower) e il download dell'analisi. Sono **ricalcolati a ogni run** (la cache delle analisi è solo in memoria, valida per il singolo run). Così, anche con un hit sul runbook, il confronto usa sempre i dati Watchtower aggiornati.
- **Lettura (hit)**: se il file esiste, **non** è stato passato `--force` **e il fingerprint coincide**, viene caricato e l'esecuzione del runbook è **saltata** (nella riga compare `fromCache: true`).
- **Scrittura (miss)**: se manca, è **stale** (fingerprint diverso) o con `--force`, il runbook viene eseguito e l'output **sovrascrive** il file.

### Perché è stata implementata

- Ogni occorrenza esegue query **CloudWatch Logs Insights**: lente (secondi a query), **fatturate a GB scansionati** e soggette a throttling. Con molte occorrenze un run diventa minuti e costo reale.
- Un'occorrenza storica (`eventId`) è **dato immutabile** e il runbook legge i log su una **finestra temporale fissa**: il risultato è di fatto **deterministico**, quindi memoizzarlo è sicuro.
- **Workflow iterativo**: puoi rilanciare per tarare la V2, le opzioni o il report **senza ripagare AWS** ogni volta.
- **Resume**: se un run lungo si interrompe, le occorrenze già elaborate restano in cache e riparti da lì invece che da zero.
- **Retention**: la cache **congela** i risultati calcolati finché i log esistevano; se la retention CloudWatch scade, una rerun non cachata darebbe `NO-DATA`, mentre la cache conserva il dato buono.

### Resettare o ignorare la cache

- **Ignora + riesegui (e sovrascrivi)**: flag `--force`.
- **Reset**: sono solo file JSON → `rm -rf data/go-rta-check/cache/` (oppure la sotto-cartella di un singolo allarme).
- **Nessun TTL/scadenza**: una entry resta valida finché non la sovrascrivi con `--force` o la cancelli a mano.

### Trabocchetti e considerazioni

- ✅ **Invalidazione automatica al cambio del runbook.** Il fingerprint include l'hash strutturale della definizione + la versione del runbook: se modifichi/aggiungi un _known case_, cambi step/query, profili/region o finestra, le entry esistenti risultano **stale** e vengono **rieseguite** (anche le vecchie entry senza fingerprint sono trattate come stale). ⚠️ **Residuo:** una modifica che vive **solo nel corpo di una funzione** (es. la logica di una `condition`/azione) senza alterare la struttura serializzabile né la `version` del runbook **non** viene rilevata: in quel caso **bumpa la `version` del runbook** (o, per invalidare tutto, `CACHE_FINGERPRINT_VERSION` in `src/runner/runbookFingerprint.ts`). `--force` resta la via rapida.
- **V1 dalla cache, V2 sempre fresca.** Anche su un hit, il confronto V2 è ricalcolato a ogni run sull'analisi Watchtower aggiornata.
- **Gli esiti completati sono cachati, i crash no.** `HIT` / `MISS` / `NO-DATA` / `CONFIG-ERROR` e anche un `EXECUTION-ERROR` derivato da un runbook con outcome `failed`/`aborted` vengono **salvati**. Solo un'**eccezione non gestita** che interrompe l'esecuzione (`EXECUTION-ERROR` _senza_ output) **non** viene cachata: quelle occorrenze sono **ritentate a ogni run** (utile per errori transitori, es. credenziali AWS scadute).
- **Versione schema.** La `schemaVersion` di `RunbookOutput` fa parte del fingerprint: un suo cambio invalida le entry. Aggiorna `EXPECTED_OUTPUT_SCHEMA_VERSION` in `src/runner/runbookFingerprint.ts` quando `go-runbook` la incrementa.
- **È locale, non si committa.** La cache vive sotto `data/` (ignorato da git, riga `data/*` del `.gitignore`): non va condivisa via repository.

## Note

- **Auth**: usa la login esistente di Watchtower (`POST /auth/login` → bearer; re-login su 401). Nessuna modifica a Watchtower.
- **Base URL**: indica la **root** del backend (es. `https://…/bff`); `/auth/*` e `/api/*` sono fratelli sotto la root. Un eventuale `/api` finale viene rimosso automaticamente, quindi anche `https://…/bff/api` funziona.
- **Ambiente**: opzionale. Con `--environment-id` (o selezione interattiva) filtri le occorrenze di quell'ambiente; **se omesso** vengono analizzati tutti gli ambienti del prodotto — o, se `targets` restringe il prodotto, tutti quelli in scope. In [modalità non interattiva](#modalità-non-interattiva-ci) l'omissione = tutti, senza prompt.
- **Scope e selezione**: `targets` è il confine operativo, e vale anche per i flag: `--product-id` / `--environment-id` vengono risolti al suo interno e falliscono se ne escono; `--alarm-name` deve esistere nel prodotto e avere un runbook locale. Ogni valore fissato salta il passo corrispondente del wizard. Dettagli in [Scope dei target](#scope-dei-target-targets) e [Selezione interattiva](#selezione-interattiva-prodotto--ambiente--runbook).
- **Resume / cache**: i risultati per occorrenza sono cache-ati; `--force` riesegue e sovrascrive. Dettagli, motivazioni e trabocchetti nella sezione [Cache (resume)](#cache-resume).
- **Output**: `data/go-rta-check/outputs/<run>/<NN-nome-allarme>/` con `results.json`, `summary.json`, `report.html`. La sottocartella numerata tiene separati gli artifact dei runbook analizzati nella stessa sessione, che altrimenti si sovrascriverebbero.
- La V2 è **assistita** (mai un verdetto secco): mostra sempre i segnali e va validata a mano.
