# Go Search Jira

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Indicizza e cerca testo dentro gli attachment delle card Jira Cloud, senza plugin Jira e senza estensioni marketplace. Lo script scarica gli attachment visibili all'utente, estrae il testo con gli extractor di `@go-automation/go-common` e lo indicizza in un database SQLite FTS5 locale.

Il client integrato usa Jira Cloud REST API v3 (`/rest/api/3/...`). Jira Data Center / Server non e supportato da questo client: richiederebbe endpoint e paginazione dedicati.

## Privacy

La cache locale e l'indice possono contenere dati sensibili estratti dagli attachment Jira, come IUN, codici fiscali, riferimenti operativi o dati personali. Trattali come dati confidenziali.

- I file binari originali vengono eliminati di default dopo l'estrazione del testo.
- Il token Jira e marcato come parametro sensibile e viene oscurato nei log/config summary.
- Evita di salvare `--storage-data-dir` in directory sincronizzate su cloud personali.
- Esegui `--action clean` quando vuoi cancellare indice e cache locali.

## Indice

- [Funzionalita](#funzionalita)
- [Regola nomi CLI](#regola-nomi-cli)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalita

- Sync incrementale da Jira tramite JQL o lista di issue key.
- Skip automatico degli attachment gia indicizzati, salvo `--sync-force`.
- Estrazione testo per PDF, DOCX, XLSX, TXT/MD/CSV/JSON/NDJSON/XML/SVG, EML e ZIP.
- Ricerca locale con SQLite FTS5/BM25 (`--search-mode full-text`).
- Ricerca literal case-insensitive per stringhe esatte, UUID, IUN o valori con punteggiatura.
- Filtro dei risultati per project key Jira.
- Export risultati in `json`, `jsonl`, `csv`, `html` o `txt`.
- Status dettagliato su indice, conteggi, MIME type e motivi di skip.
- Pulizia completa o solo della cache binaria.

## Regola nomi CLI

Nel codice i parametri sono definiti con dot notation, per esempio:

```text
jira.url
sync.max.parallel.downloads
output.format
```

Sulla linea di comando vanno passati in kebab-case, con trattino:

```text
--jira-url
--sync-max-parallel-downloads
--output-format
```

Quindi non usare flag CLI con il punto. Le forme dot notation come `jira.url`, `sync.max.parallel.downloads` e `output.format` restano valide nei file JSON/YAML di configurazione, dove puoi usare oggetti annidati.

## Prerequisiti

| Software    | Versione minima | Note                                                                                           |
| ----------- | --------------- | ---------------------------------------------------------------------------------------------- |
| Node.js     | >= 22.14.0      | Allineato agli engine del monorepo                                                             |
| pnpm        | >= 10.28.0      | Allineato agli engine del monorepo                                                             |
| Build tools | sistema         | Richiesti da `better-sqlite3`: macOS `xcode-select --install`; Linux `build-essential python3` |

### Credenziali Jira

Per Jira Cloud:

1. Genera un API token da <https://id.atlassian.com/manage-profile/security/api-tokens>.
2. Esporta il token:

```bash
export JIRA_TOKEN='...'
```

Lo script risolve automaticamente il parametro `jira.token` anche dalla variabile ambiente `JIRA_TOKEN`. In alternativa puoi passarlo con `--jira-token`, ma per uso quotidiano e preferibile l'env var.

`--jira-auth-mode bearer` cambia solo lo schema dell'header `Authorization` e resta pensato per endpoint compatibili con Jira Cloud REST API v3. Non abilita il supporto Jira Data Center / Server.

## Configurazione

### Parametri CLI

| Parametro CLI                   | Alias | Tipo     | Obbligatorio                    | Default          | Descrizione                                        |
| ------------------------------- | ----- | -------- | ------------------------------- | ---------------- | -------------------------------------------------- |
| `--action`                      | `-ac` | string   | si                              | -                | `sync`, `search`, `status`, `clean`                |
| `--jira-url`                    |       | string   | per `sync`                      | vuoto            | Base URL Jira, es. `https://example.atlassian.net` |
| `--jira-email`                  |       | string   | per basic auth                  | vuoto            | Email associata al token Jira Cloud                |
| `--jira-token`                  |       | string   | per `sync`                      | `JIRA_TOKEN` env | Token Jira. Parametro sensibile                    |
| `--jira-auth-mode`              |       | string   | no                              | `basic`          | `basic` o `bearer` per Jira Cloud REST API v3      |
| `--jira-jql`                    |       | string   | per `sync` se non usi issue key | vuoto            | JQL per scoprire le issue                          |
| `--jira-issue-keys`             |       | string[] | per `sync` se non usi JQL       | vuoto            | Lista issue key, separata da virgole o spazi       |
| `--sync-max-parallel-downloads` |       | int      | no                              | `5`              | Download concorrenti                               |
| `--sync-max-attachment-size-mb` |       | int      | no                              | `500`            | Skip degli attachment piu grandi del limite        |
| `--sync-keep-raw`               |       | bool     | no                              | `false`          | Conserva i binari scaricati dopo l'estrazione      |
| `--sync-dry-run`                |       | bool     | no                              | `false`          | Pianifica senza scaricare o indicizzare            |
| `--sync-force`                  |       | bool     | no                              | `false`          | Reindicizza attachment gia presenti                |
| `--search-query`                | `-q`  | string   | per `search`                    | vuoto            | Query di ricerca                                   |
| `--search-mode`                 |       | string   | no                              | `full-text`      | `full-text` o `literal`                            |
| `--search-limit`                |       | int      | no                              | `20`             | Numero massimo risultati                           |
| `--search-project`              |       | string   | no                              | vuoto            | Filtra per project key Jira                        |
| `--output-file`                 | `-of` | string   | no                              | auto             | File di export risultati                           |
| `--output-format`               | `-ff` | string   | no                              | `json`           | `txt`, `json`, `jsonl`, `csv`, `html`              |
| `--clean-raw-only`              |       | bool     | no                              | `false`          | Cancella solo i binari in cache                    |
| `--clean-yes`                   |       | bool     | no                              | `false`          | Salta la conferma interattiva                      |
| `--storage-data-dir`            |       | string   | no                              | GOPaths data dir | Directory per `index.db` e cache attachment        |
| `--storage-index-file-name`     |       | string   | no                              | `index.db`       | Nome del database SQLite                           |

### Variabili d'ambiente

Il framework converte i nomi dot notation in env var uppercase con underscore.

| Variabile        | Parametro        | Descrizione                                   |
| ---------------- | ---------------- | --------------------------------------------- |
| `JIRA_TOKEN`     | `jira.token`     | Token Jira. Uso consigliato                   |
| `JIRA_URL`       | `jira.url`       | Base URL Jira                                 |
| `JIRA_EMAIL`     | `jira.email`     | Email Jira Cloud                              |
| `JIRA_AUTH_MODE` | `jira.auth.mode` | `basic` o `bearer` per Jira Cloud REST API v3 |

### File di configurazione

Puoi usare un file JSON/YAML secondo le convenzioni di `GOScript`. Nel file di configurazione la forma annidata e corretta:

```json
{
  "jira": {
    "url": "https://example.atlassian.net",
    "email": "user@example.com",
    "jql": "project = PN AND updated >= -90d"
  },
  "sync": {
    "max": {
      "parallel": {
        "downloads": 5
      },
      "attachment": {
        "size": {
          "mb": 500
        }
      }
    }
  },
  "output": {
    "format": "json"
  }
}
```

Non salvare il token in file versionati. Preferisci `JIRA_TOKEN`.

### Priorita

1. Parametri CLI
2. Variabili d'ambiente
3. File di configurazione
4. Default dichiarati in `src/config.ts`

## Utilizzo

Esegui gli esempi dalla root del monorepo.

### Status

`status` non contatta Jira. Serve per verificare dove lo script sta cercando l'indice.

```bash
pnpm --filter=go-search-jira dev -- --action status
```

Con directory dati esplicita:

```bash
pnpm --filter=go-search-jira dev -- \
  --action status \
  --storage-data-dir ~/.go-automation/go-search-jira
```

### Sync iniziale via JQL

```bash
export JIRA_TOKEN='...'

pnpm --filter=go-search-jira dev -- \
  --action sync \
  --jira-url https://example.atlassian.net \
  --jira-email user@example.com \
  --jira-jql 'project = PN AND updated >= -90d'
```

### Sync su issue specifiche

```bash
pnpm --filter=go-search-jira dev -- \
  --action sync \
  --jira-url https://example.atlassian.net \
  --jira-email user@example.com \
  --jira-issue-keys PN-1234,PN-5678
```

Puoi passare array anche ripetendo il flag:

```bash
pnpm --filter=go-search-jira dev -- \
  --action sync \
  --jira-url https://example.atlassian.net \
  --jira-email user@example.com \
  --jira-issue-keys PN-1234 \
  --jira-issue-keys PN-5678
```

### Dry-run

Il dry-run valida discovery e pianificazione, ma non scarica e non aggiorna l'indice. Nel report finale i download che verrebbero eseguiti sono conteggiati come `Planned downloads`, separati dagli attachment realmente esclusi dal piano (`Skipped`).

```bash
pnpm --filter=go-search-jira dev -- \
  --action sync \
  --jira-url https://example.atlassian.net \
  --jira-email user@example.com \
  --jira-jql 'project = PN AND updated >= -7d' \
  --sync-dry-run
```

### Sync forzato

```bash
pnpm --filter=go-search-jira dev -- \
  --action sync \
  --jira-url https://example.atlassian.net \
  --jira-email user@example.com \
  --jira-jql 'project = PN AND updated >= -7d' \
  --sync-force
```

### Ricerca full-text

La ricerca apre solo l'indice locale. `--jira-url` e opzionale ma consigliato: senza URL i link alle issue non sono cliccabili.

```bash
pnpm --filter=go-search-jira dev -- \
  --action search \
  --jira-url https://example.atlassian.net \
  --search-query 'tpp timeout'
```

Con alias:

```bash
pnpm --filter=go-search-jira dev -- \
  --action search \
  --jira-url https://example.atlassian.net \
  -q 'tpp timeout'
```

### Ricerca literal

Usa `literal` per valori esatti o con punteggiatura, come UUID, IUN, request id o codice fiscale.

```bash
pnpm --filter=go-search-jira dev -- \
  --action search \
  --jira-url https://example.atlassian.net \
  --search-query 'IUN-1234-5678' \
  --search-mode literal
```

### Filtro progetto ed export

```bash
pnpm --filter=go-search-jira dev -- \
  --action search \
  --jira-url https://example.atlassian.net \
  --search-query 'webhook' \
  --search-project PN \
  --search-limit 50 \
  --output-format csv \
  --output-file jira-webhook-results.csv
```

Se `--output-file` non e valorizzato, lo script crea un file nel percorso output risolto da `GOPaths`, con nome simile a:

```text
go-search-jira_2026-05-09.json
```

### Clean

```bash
# Reset completo: cancella indice e cache binaria, con conferma
pnpm --filter=go-search-jira dev -- --action clean

# Cancella solo i binari scaricati, lasciando l'indice
pnpm --filter=go-search-jira dev -- \
  --action clean \
  --clean-raw-only

# Reset completo senza prompt
pnpm --filter=go-search-jira dev -- \
  --action clean \
  --clean-yes
```

### Modalita production

```bash
pnpm --filter=go-search-jira build
pnpm --filter=go-search-jira start -- --action status
```

Shortcut root disponibili:

```bash
pnpm go:search:jira:dev -- --action status
pnpm go:search:jira:build
pnpm go:search:jira:prod -- --action status
```

## Output

### Sync

`sync` stampa un report console con:

- issue processate;
- attachment indicizzati;
- attachment saltati;
- attachment falliti;
- byte scaricati;
- durata;
- primi errori, se presenti.

### Search

`search` esporta i risultati su file. I campi principali sono:

- `issueKey`
- `summary`
- `projectKey`
- `attachmentId`
- `filename`
- `mimeType`
- `score`
- `snippet`
- `issueUrl`
- `attachmentUrl`

Formati supportati:

| Formato | Descrizione                                   |
| ------- | --------------------------------------------- |
| `json`  | Oggetto con `generatedAt`, `count`, `results` |
| `jsonl` | Un risultato JSON per riga                    |
| `csv`   | CSV con header                                |
| `html`  | Tabella HTML                                  |
| `txt`   | Una riga testuale per risultato               |

### Status

Esempio indicativo:

```text
> Status
  Data dir:    /.../data/go-search-jira
  Index file:  /.../data/go-search-jira/index.db
  Index size:        148 MB
  Tokenizer:         unicode61 remove_diacritics 2
  Indexed documents: 4812
  Attachments:       4812 indexed | 312 skipped | 8 failed | 0 deleted
  Issues:            1024
  Last sync:         2026-05-09T09:14:21.000Z
```

## Troubleshooting

### Errore: "Jira token is not set"

**Causa**: il parametro `jira.token` non e stato risolto da CLI, env var o config.

**Soluzione**:

```bash
export JIRA_TOKEN='...'
```

Oppure, meno consigliato:

```bash
pnpm --filter=go-search-jira dev -- \
  --action sync \
  --jira-url https://example.atlassian.net \
  --jira-email user@example.com \
  --jira-token '...'
```

### Errore: "Jira basic auth requires --jira-email"

**Causa**: stai usando `--jira-auth-mode basic`, ma manca l'email. Il messaggio mostra il nome interno `jira-email`; da CLI il parametro corretto e `--jira-email`.

**Soluzione**: aggiungi `--jira-email user@example.com` oppure usa `--jira-auth-mode bearer` solo se il tuo endpoint Jira Cloud REST API v3 accetta bearer token.

### Errore: "Provide --jira-jql or --jira-issue-keys"

**Causa**: `sync` non sa quali issue scansionare.

**Soluzione**:

```bash
pnpm --filter=go-search-jira dev -- \
  --action sync \
  --jira-url https://example.atlassian.net \
  --jira-email user@example.com \
  --jira-jql 'project = PN AND updated >= -30d'
```

### Errore: "Index not found ... Run `--action sync` first"

**Causa**: stai cercando prima di aver creato l'indice.

**Soluzione**: esegui prima `sync` con una JQL o una lista di issue key.

### Errore: "better-sqlite3 native module failed to build"

**Causa**: mancano i build tools per compilare moduli nativi.

**Soluzione**:

```bash
# macOS
xcode-select --install

# Ubuntu / Debian
sudo apt install -y build-essential python3

pnpm install
```

### Nessun risultato per UUID, IUN o stringhe con trattini

**Causa**: la modalita full-text tokenizza il testo e puo spezzare valori con punteggiatura.

**Soluzione**:

```bash
pnpm --filter=go-search-jira dev -- \
  --action search \
  --search-query 'IUN-1234-5678' \
  --search-mode literal
```

### Voglio cancellare tutto

```bash
pnpm --filter=go-search-jira dev -- \
  --action clean \
  --clean-yes
```

## Debug

```bash
pnpm --filter=go-search-jira exec tsc --noEmit
pnpm --filter=go-search-jira test
```

---

**Ultima modifica**: 2026-05-09
**Maintainer**: Team GO - Gestione Operativa
