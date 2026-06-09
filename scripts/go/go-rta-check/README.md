# go-rta-check

Confronta l'esecuzione dei **runbook** di `go-analyze-alarm` con le **analisi Watchtower**, su tutte le occorrenze in cui un allarme è scattato in un periodo.

Per ogni occorrenza esegue **due verifiche**:

- **V1 — copertura runbook** (deterministica): `HIT` / `MISS` / `NO-DATA` / `CONFIG-ERROR` / `EXECUTION-ERROR`.
- **V2 — coerenza con l'analisi** (assistita): `MATCH_EXACT` / `MATCH_STRONG` / `MATCH_WEAK` / `NO_EVIDENCE` / `CONFLICT` / `NOT_LINKED` / `NOT_ANALYZED`, con segnali e motivazioni (incl. overlap `traceId`/`requestId`). Di default usa GO-AI `semantic-match`; `--analysis-matcher lexical` forza il matcher lessicale storico.

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

| Verifica       | Significato                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `MATCH_EXACT`  | `traceId`/`requestId` in comune, oppure id/descrizione del caso citati nell'analisi.                                   |
| `MATCH_STRONG` | Segnali forti concordi (downstream / keyword / descrizione), score alto.                                               |
| `MATCH_WEAK`   | Solo segnali deboli concordi.                                                                                          |
| `NO_EVIDENCE`  | Analisi collegata ma testo insufficiente, **oppure** il runbook non ha rilevato un caso da confrontare.                |
| `CONFLICT`     | Categoria d'errore del runbook **divergente** da quella dell'analisi.                                                  |
| `NOT_LINKED`   | Occorrenza **senza analisi** collegata.                                                                                |
| `NOT_ANALYZED` | Analisi `IGNORABLE` o non `COMPLETED` → non usata come oracolo (salvo `--include-ignorable` / `--include-incomplete`). |

Vedi `docs/evolutions/EVO-RTACHECK-OPUS-02.md` per il design completo.

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

| Flag                          | Default            | Significato                                                                 |
| ----------------------------- | ------------------ | --------------------------------------------------------------------------- |
| `--analysis-matcher`          | `ai`               | `ai` oppure `lexical`                                                       |
| `--go-ai-semantic-threshold`  | `70`               | Soglia 0..100 per considerare equivalente lo score GO-AI                    |
| `--go-ai-fallback-to-lexical` | `true`             | Se GO-AI fallisce, usa il matcher lessicale invece di marcare `NO_EVIDENCE` |
| `--aws-profile`               | `sso_pn-analytics` | Profilo AWS standard usato da GO-AI/Bedrock                                 |

## Esecuzione

Interattiva (selezione prodotto/allarme/periodo):

```bash
pnpm go:rta:check -- \
  --watchtower-url "$WATCHTOWER_BASE_URL" \
  --aws-profiles "sso_pn-core-prod_readonly"
# email/password: --watchtower-email / --watchtower-password, env (gestita da GOScript) o prompt
```

Non interattiva / CI:

```bash
pnpm go:rta:check -- \
  --watchtower-url "$WATCHTOWER_BASE_URL" \
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
- **Ambiente**: opzionale. Con `--environment-id` (o selezione interattiva) filtri le occorrenze di quell'ambiente; **se omesso** vengono analizzati tutti gli ambienti del prodotto. In modalità non interattiva (flag-driven) l'omissione = tutti, senza prompt.
- **Resume / cache**: i risultati per occorrenza sono cache-ati; `--force` riesegue e sovrascrive. Dettagli, motivazioni e trabocchetti nella sezione [Cache (resume)](#cache-resume).
- **Output**: `data/go-rta-check/outputs/<run>/` con `results.json`, `summary.json`, `report.html`.
- La V2 è **assistita** (mai un verdetto secco): mostra sempre i segnali e va validata a mano.
