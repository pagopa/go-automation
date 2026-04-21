# GO AI Client

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

`go-ai-client` e una CLI locale per usare GO-AI da terminale. Può chiamare Amazon Bedrock direttamente oppure inoltrare la richiesta alla Lambda deployata `go-ai-prod`; in entrambi i casi accetta un "hat" tematico, riceve input testuale o da file e stampa sempre l'output finale in JSON formattato.

## Indice

- [Funzionalità](#funzionalità)
- [Come funziona](#come-funziona)
- [Hat disponibili](#hat-disponibili)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalità

- **Doppia modalità di invocazione**: `direct` per chiamare Bedrock direttamente dal client locale, `lambda` per passare dalla Lambda GO-AI già deployata.
- **Input flessibile**: accetta una stringa inline oppure il contenuto di un file di testo.
- **Prompt specializzati ("hat")**: ogni hat usa un template dedicato per casi d'uso QA, analisi requisiti, runbook e diagnosi allarmi.
- **Output stabile**: se il modello restituisce JSON puro o racchiuso in fence Markdown, il client lo normalizza e lo ristampa in formato pretty-print.
- **Metriche immediate**: stampa hat, modalità, profilo AWS usato e conteggio token input/output.
- **Integrazione nativa con GOScript**: supporta CLI, `.env`, file di configurazione opzionali e logging su file come gli altri script del monorepo.

## Come funziona

1. **Caricamento configurazione**: legge parametri da CLI, eventuali file di config, variabili d'ambiente e default.
2. **Selezione hat**: se `--hat` non e valorizzato, stampa la lista degli hat disponibili e una usage minima.
3. **Validazione input**: verifica che l'hat esista e che `--input` sia stato passato.
4. **Risoluzione sorgente input**: prova a trattare `--input` come file; se il file non esiste, usa la stringa così com'è.
5. **Invocazione AI**:
   - `direct`: usa `@go-automation/go-ai` e `GOBedrockClient`
   - `lambda`: invoca in modo sincrono la funzione Lambda configurata
6. **Normalizzazione output**: rimuove eventuali blocchi Markdown fenced con JSON, prova il parse JSON e, se non riesce, incapsula il testo come `{ "text": "..." }`.
7. **Stampa risultato**: mostra i token usati e serializza il risultato finale con `JSON.stringify(..., null, 2)`.

## Hat disponibili

Gli hat sono definiti nel package condiviso [`packages/go-ai/prompts.yaml`](/Users/massimo/Dropbox/Projects/PagoPa/repos/go-automation/packages/go-ai/prompts.yaml) e sono gli stessi usati anche dalla Lambda GO-AI.

| Hat               | Scopo                                                                          | Struttura output attesa                               |
| ----------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `normal`          | Genera scenari e test case QA a partire da un requisito                        | `test_scenarios`, `test_cases`, `edge_cases`, `risks` |
| `gherkin`         | Converte un requisito in scenari BDD Gherkin                                   | `gherkin_scenarios`                                   |
| `srs-analysis`    | Estrae requisiti, ambiguita e rischi da SRS/User Story                         | `requirements`, `ambiguities`, `risks`                |
| `code-review`     | Analizza codice TypeScript cercando bug, problemi di sicurezza e best practice | `issues`                                              |
| `runbook-assist`  | Suggerisce step, miglioramenti e casi scoperti per runbook/allarmi             | `steps`, `improvements`, `uncoveredCases`             |
| `alarm-diagnosis` | Produce una diagnosi operativa strutturata di un allarme                       | `cause`, `severity`, `actions`, `classification`      |

### Note sugli hat

- Tutti i template chiedono al modello di restituire **solo JSON**.
- Il client non espone via CLI `maxTokens` e `temperature`: oggi usa i default del wrapper GO-AI (`maxTokens=2000`, `temperature=0.3`, `topP=0.9`).
- L'output finale può comunque diventare `{ "text": "..." }` se il modello restituisce testo non parseabile come JSON.

## Prerequisiti

### Software richiesto

| Software | Versione minima | Note                                    |
| -------- | --------------- | --------------------------------------- |
| Node.js  | >= 22.14.0      | Compatibile con gli engine del monorepo |
| pnpm     | >= 10.28.0      | Package manager del workspace           |
| AWS CLI  | >= 2.0          | Utile per login SSO e verifiche manuali |

### Accessi AWS richiesti

#### Modalità `direct`

- Profilo AWS SSO valido nella regione Bedrock scelta
- Permessi per invocare il modello Bedrock configurato
- Default del client:
  - `AWS_REGION=eu-south-1`
  - `AWS_PROFILE=sso_pn-analytics`
  - `BEDROCK_MODEL_ARN=arn:aws:bedrock:eu-south-1:170533023216:inference-profile/eu.amazon.nova-pro-v1:0`

#### Modalità `lambda`

- Profilo AWS SSO valido nella regione Lambda scelta
- Permesso `lambda:InvokeFunction` sulla funzione configurata
- Default della funzione: `go-ai-prod`

### Login AWS SSO

```bash
aws sso login --profile sso_pn-analytics
aws sts get-caller-identity --profile sso_pn-analytics
```

## Configurazione

### Parametri CLI

| Parametro             | Alias | Tipo   | Obbligatorio | Default            | Descrizione                                                                            |
| --------------------- | ----- | ------ | ------------ | ------------------ | -------------------------------------------------------------------------------------- |
| `--hat`               | `-h`  | string | Si           | -                  | Hat GO-AI da usare                                                                     |
| `--input`             | `-i`  | string | Si           | -                  | Testo inline oppure path a file                                                        |
| `--go-ai-mode`        | `-m`  | string | No           | `direct`           | Modalità di invocazione: `direct` o `lambda`                                           |
| `--go-ai-lambda-name` | -     | string | No           | `go-ai-prod`       | Nome della Lambda da invocare in modalità `lambda` (chiave config: `go.ai.lambdaName`) |
| `--aws-region`        | -     | string | No           | `eu-south-1`       | Regione AWS                                                                            |
| `--aws-profile`       | -     | string | No           | `sso_pn-analytics` | Profilo AWS SSO locale                                                                 |

> Nota: l'alias `-h` e definito nel codice, ma collide con l'help automatico di GOScript. In pratica e meglio usare sempre `--hat`.

### Variabili d'ambiente supportate

Le chiavi con `dot.notation` vengono convertite automaticamente in variabili ambiente uppercase con underscore.

| Variabile           | Equivalente CLI       | Descrizione                                                            |
| ------------------- | --------------------- | ---------------------------------------------------------------------- |
| `HAT`               | `--hat`               | Hat da usare                                                           |
| `INPUT`             | `--input`             | Testo o file di input                                                  |
| `GO_AI_MODE`        | `--go-ai-mode`        | `direct` o `lambda`                                                    |
| `GO_AI_LAMBDA_NAME` | `--go-ai-lambda-name` | Nome della Lambda target                                               |
| `AWS_REGION`        | `--aws-region`        | Regione AWS                                                            |
| `AWS_PROFILE`       | `--aws-profile`       | Profilo AWS SSO                                                        |
| `BEDROCK_MODEL_ARN` | -                     | Override del modello/profilo di inferenza Bedrock in modalità `direct` |

### Risoluzione dell'input da file

`--input` viene interpretato cosi:

- **Path assoluto**: usato così com'è
- **Path relativo**: risolto sotto `data/go-ai-client/inputs/`
- **Stringa non trovata come file**: trattata come input raw

Esempi:

```bash
# Input raw
--input "Dato il requisito X, genera i test case"

# File assoluto
--input "/Users/massimo/Desktop/requirement.txt"

# File relativo: à cercato in data/go-ai-client/inputs/
--input "requirement.txt"
```

Se usi spesso file relativi, la struttura consigliata e:

```text
data/
  go-ai-client/
    inputs/
      requirement.txt
      alarm.txt
```

### File di configurazione opzionali

Il repository non include un `config.json` dedicato per questo script, ma GOScript supporta comunque i file standard. Per ciascun tipo cerca prima la directory centralizzata e, se assente, quella locale dello script:

- `data/go-ai-client/configs/config.json`
- `data/go-ai-client/configs/config.yaml`
- `data/go-ai-client/configs/.env`
- `scripts/go/go-ai-client/configs/config.json`
- `scripts/go/go-ai-client/configs/config.yaml`
- `scripts/go/go-ai-client/configs/.env`

### Priorita di configurazione

1. **CLI arguments**
2. **JSON config**
3. **YAML config**
4. **Variabili ambiente / `.env`**
5. **Valori di default**

## Utilizzo

Nel `package.json` root non esiste ancora uno shortcut dedicato per questo script, quindi i comandi vanno eseguiti con `--filter=go-ai-client`.

### Elencare gli hat disponibili

```bash
pnpm --filter=go-ai-client dev
```

### Mostrare l'help completo

```bash
pnpm --filter=go-ai-client dev -- --help
```

### Modalità `direct` con input inline

```bash
pnpm --filter=go-ai-client dev -- \
  --hat gherkin \
  --input "Come utente autenticato voglio poter scaricare la ricevuta PDF dal dettaglio notifica" \
  --aws-profile sso_pn-analytics \
  --aws-region eu-south-1
```

### Modalità `direct` con input da file assoluto

```bash
pnpm --filter=go-ai-client dev -- \
  --hat srs-analysis \
  --input "/Users/massimo/Desktop/srs.txt" \
  --aws-profile sso_pn-analytics
```

### Modalità `direct` con input da file relativo

Supponendo che il file esista in `data/go-ai-client/inputs/alarm.txt`:

```bash
pnpm --filter=go-ai-client dev -- \
  --hat alarm-diagnosis \
  --input alarm.txt
```

### Modalità `lambda`

```bash
pnpm --filter=go-ai-client dev -- \
  --hat runbook-assist \
  --input "Analizza questo allarme e suggerisci migliorie al runbook" \
  --go-ai-mode lambda \
  --go-ai-lambda-name go-ai-prod \
  --aws-profile sso_pn-analytics
```

### Modalità `lambda` via variabili ambiente

```bash
GO_AI_MODE=lambda \
GO_AI_LAMBDA_NAME=go-ai-prod \
AWS_PROFILE=sso_pn-analytics \
pnpm --filter=go-ai-client dev -- \
  --hat code-review \
  --input "/Users/massimo/Desktop/example.ts"
```

### Modalità production

Lo script `start` esegue prima la build TypeScript e poi lancia `dist/index.js`.

```bash
pnpm --filter=go-ai-client start -- \
  --hat gherkin \
  --input "Dato il requisito, genera scenari BDD"
```

### Esecuzione standalone dopo build

```bash
pnpm --filter=go-ai-client build
node scripts/go/go-ai-client/dist/index.js \
  --hat normal \
  --input "Genera test case da questo requisito"
```

## Output

### Output console

Il client stampa prima alcune informazioni operative e poi il payload finale:

```text
Hat:     gherkin
Mode:    direct
Profile: sso_pn-analytics
Input:   184 chars
312 in / 941 out tokens
{
  "gherkin_scenarios": [
    {
      "id": "GH-001",
      "scenario": "Download ricevuta PDF",
      "steps": [
        "Given ...",
        "When ...",
        "Then ..."
      ],
      "preconditions": "...",
      "type": "functional",
      "expected_result": "..."
    }
  ]
}
```

### Log file

In esecuzione locale GOScript abilita anche il logging su file. Ogni run crea una directory di output dedicata:

```text
data/go-ai-client/outputs/go-ai-client_YYYY-MM-DDTHH-mm-ss/execution.log
```

Lo script non produce file di report aggiuntivi: il risultato applicativo principale e quello stampato su `stdout`.

### Normalizzazione del risultato

- Se il modello restituisce JSON valido, il client lo pretty-printa.
- Se il modello restituisce JSON dentro fence Markdown, il client rimuove le fence e poi fa il parse.
- Se il parse fallisce, il client stampa:

```json
{
  "text": "contenuto testuale restituito dal modello"
}
```

## Troubleshooting

### `-h` apre l'help invece di impostare l'hat

**Causa**: `-h` collide con l'help automatico di GOScript.

**Soluzione**: usare sempre il parametro esteso:

```bash
--hat gherkin
```

### `Missing input. Provide --input with a text string or a file path.`

**Causa**: manca `--input`.

**Soluzione**:

```bash
pnpm --filter=go-ai-client dev -- \
  --hat gherkin \
  --input "testo o path"
```

### `Unknown hat: '...'`

**Causa**: il valore di `--hat` non appartiene all'enum `GOAIHat`.

**Soluzione**: lanciare lo script senza `--hat` per vedere la lista completa:

```bash
pnpm --filter=go-ai-client dev
```

### `ExpiredToken` / credenziali AWS scadute

```bash
aws sso login --profile sso_pn-analytics
aws sts get-caller-identity --profile sso_pn-analytics
```

### `AccessDeniedException` in modalità `direct`

**Possibili cause**:

- Profilo AWS senza permessi Bedrock
- Regione errata
- `BEDROCK_MODEL_ARN` non accessibile dal profilo selezionato

**Verifiche consigliate**:

```bash
echo "$AWS_PROFILE"
echo "$AWS_REGION"
```

Poi rieseguire esplicitando i parametri:

```bash
pnpm --filter=go-ai-client dev -- \
  --hat alarm-diagnosis \
  --input "..." \
  --aws-profile sso_pn-analytics \
  --aws-region eu-south-1
```

### Errore Lambda in modalità `lambda`

Sintomi tipici:

- `ResourceNotFoundException`
- `AccessDeniedException`
- `GO-AI Lambda error: ...`

**Verifiche consigliate**:

- Controllare `--go-ai-lambda-name`
- Verificare di essere nella regione giusta
- Verificare i permessi `lambda:InvokeFunction`

Esempio:

```bash
pnpm --filter=go-ai-client dev -- \
  --hat runbook-assist \
  --input "..." \
  --go-ai-mode lambda \
  --go-ai-lambda-name go-ai-prod \
  --aws-region eu-south-1 \
  --aws-profile sso_pn-analytics
```

### Un file relativo non viene trovato

**Causa**: i path relativi non sono risolti rispetto alla directory corrente, ma rispetto a `data/go-ai-client/inputs/`.

**Soluzioni**:

- spostare il file in `data/go-ai-client/inputs/`
- usare un path assoluto

### `Cannot find module '@go-automation/go-common'`

**Causa**: pacchetti workspace non buildati correttamente.

**Soluzione**:

```bash
pnpm build:common
pnpm --filter=go-ai-client build
```

### Verifica typecheck

```bash
pnpm --filter=go-ai-client exec tsc --noEmit
```

---

**Ultima modifica**: 2026-04-09
**Maintainer**: Team GO - Gestione Operativa
