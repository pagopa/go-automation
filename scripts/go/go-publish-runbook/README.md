# GO Publish Runbook

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script per la pubblicazione di runbook in formato Markdown su Confluence Cloud. Lo script converte dinamicamente il contenuto Markdown nel formato Atlassian Document Format (ADF) e lo pubblica tramite le API REST v2 di Confluence.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Esempi Pratici](#esempi-pratici)
- [Troubleshooting](#troubleshooting)

## Funzionalità

- **Conversione Markdown to ADF**: Trasforma automaticamente testo, tabelle, intestazioni e blocchi di codice Markdown in un albero ADF conforme.
- **Validazione Interna**: Verifica la struttura ADF generata prima dell'invio alle API di Confluence per prevenire errori 400.
- **Integrazione API v2**: Utilizza le API REST v2 di Confluence Cloud per la creazione delle pagine.
- **Gestione Sicura Credenziali**: Supporta il mascheramento dei token API nei log e l'integrazione con variabili d'ambiente.
- **Logging Dettagliato**: Fornisce feedback immediato sull'esito della pubblicazione con link diretto alla pagina creata.

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                   |
| ---------- | --------------- | ---------------------- |
| Node.js    | >= 22.14.0      | LTS consigliata (v22+) |
| pnpm       | >= 10.0.0       | Package manager        |
| TypeScript | >= 5.9.0        | Incluso nel progetto   |

### Account e Permessi

- Account Atlassian con accesso a Confluence Cloud.
- Permessi di creazione pagine nello Space di destinazione.
- API Token di Atlassian generato dal proprio account.

## Configurazione

### Parametri CLI

| Parametro                | Alias   | Tipo   | Obbligatorio | Default | Descrizione                                                   |
| ------------------------ | ------- | ------ | ------------ | ------- | ------------------------------------------------------------- |
| `--input-file`           | `-i`    | string | Sì           | -       | Percorso del file JSON contenente il payload del runbook      |
| `--confluence-base-url`  | `--url` | string | No           | Env     | URL di Confluence (es. `https://domain.atlassian.net/wiki`)   |
| `--confluence-email`     | `-e`    | string | No           | Env     | Email dell'utente Atlassian                                   |
| `--confluence-api-token` | `-t`    | string | No           | Env     | Token API di Atlassian (gestito come secret)                  |

### Variabili d'Ambiente

Lo script supporta il caricamento di variabili d'ambiente tramite file `.env` nella cartella dello script o tramite variabili di sistema.

| Variabile              | Descrizione                                  | Esempio                                   |
| ---------------------- | -------------------------------------------- | ----------------------------------------- |
| `CONFLUENCE_BASE_URL`  | URL base dell'istanza Confluence             | `https://pagopa.atlassian.net/wiki`       |
| `CONFLUENCE_EMAIL`     | Email account Atlassian                      | `nome.cognome@pagopa.it`                  |
| `CONFLUENCE_API_TOKEN` | Token API generato su Atlassian              | `ATATT...`                                |

### Struttura Input JSON

Il file di input deve essere un JSON con la seguente struttura:

```json
{
  "metadata": {
    "spaceKey": "SPACEID",
    "parentId": "123456789",
    "title": "Titolo del Runbook"
  },
  "markdownBody": "# Intestazione\n\nContenuto del runbook in **Markdown**..."
}
```

## Utilizzo

### Modalità Development

```bash
# Dalla root del monorepo
pnpm --filter=go-publish-runbook dev -- -i data/payload.json
```

### Modalità Production

```bash
# Build
pnpm --filter=go-publish-runbook build

# Esecuzione
pnpm --filter=go-publish-runbook start -- -i data/payload.json
```

## Esempi Pratici

### Esempio 1: Pubblicazione con parametri da CLI

```bash
pnpm --filter=go-publish-runbook dev -- \
  --input-file "./data/runbook-v0.json" \
  --url "https://pagopa.atlassian.net/wiki" \
  --e "ops@pagopa.it" \
  --t "SECRET_TOKEN"
```

### Esempio 2: Pubblicazione usando file .env

```bash
# Assicurati che .env sia configurato correttamente
pnpm --filter=go-publish-runbook dev -- -i "./data/runbook-v0.json"
```

## Output

### Esempio Output Console Successo

```console
[INFO] Ingestione payload da: data/payload.json
[INFO] Conversione Markdown in ADF per la pagina: "Manuale Operativo"
[INFO] Validazione ADF generato...
[INFO] Pubblicazione su Confluence: https://pagopa.atlassian.net/wiki
[SUCCESS] Pagina pubblicata con successo!
[INFO] ID Pagina: 987654321
[INFO] Link: https://pagopa.atlassian.net/wiki/spaces/GO/pages/987654321/Manuale+Operativo
```

## Troubleshooting

### Problemi Comuni

#### Errore: "Mancano le configurazioni di Confluence"

**Causa**: Non sono state fornite le credenziali né via CLI né via ambiente.
**Soluzione**: Controllare il file `.env` o passare i parametri `--url`, `-e`, `-t`.

#### Errore: "Validazione ADF fallita"

**Causa**: Il contenuto Markdown ha generato una struttura non valida per Confluence (es. tabelle annidate non supportate).
**Soluzione**: Semplificare il formato Markdown sorgente.

#### Errore: "HTTP 401 Unauthorized"

**Causa**: Email o API Token non validi.
**Soluzione**: Verificare le credenziali e rigenerare l'API Token se necessario.

#### Errore: "HTTP 400 Bad Request"

**Causa**: Spesso dovuto a un `parentId` inesistente o a un `spaceId` non corretto.
**Soluzione**: Verificare i metadati nel file JSON di input.

---

**Ultima modifica**: 2026-04-04
**Maintainer**: Team GO - Gestione Operativa
