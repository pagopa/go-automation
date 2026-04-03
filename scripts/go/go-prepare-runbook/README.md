# GO Prepare Runbook

Questo script automatizza la preparazione di un Runbook partendo da sorgenti Markdown, gestendo l'ingestion, il merging di asset condivisi e la validazione dei metadati per produrre un payload JSON pronto per la pubblicazione su Confluence.

## Workflow dello Script

Il processo di preparazione segue un flusso lineare suddiviso in cinque fasi principali:

### 1. Ingestion e Parsing (gray-matter)

Lo script legge il file Markdown di input (`--input-file`). Utilizza la libreria **gray-matter** per separare il file in due componenti:

- **Metadati Sorgente (YAML)**: Il blocco di frontmatter iniziale racchiuso tra `---`.
- **Corpo del Runbook (Markdown)**: Il contenuto testuale principale.

### 2. Caricamento Asset Condivisi

Viene scansionata la directory degli asset (`--shared-assets-dir`) per caricare frammenti riutilizzabili:

- **Asset di Metadati (JSON)**: File `.json` contenenti metadati aggiuntivi da integrare.
- **Asset di Contenuto (Markdown)**: File `.md` contenenti snippet di testo (es. istruzioni di deploy standard).

### 3. Risoluzione e Merging

In questa fase, il runbook viene "assemblato":

- **Merge dei Metadati**: Lo script unisce i **metadati sorgente (YAML)** con gli **asset di metadati (JSON)** referenziati nell'array `assets`. Il risultato è un unico oggetto di metadati in memoria.
- **Sostituzione Placeholder**: Lo script cerca nel corpo del Markdown i placeholder `{{ nome_asset }}` e li sostituisce con il contenuto degli **asset di contenuto (Markdown)**.

### 4. Validazione Stretta (Zod)

I metadati finali risultanti dal merge vengono validati tramite **Zod**. Lo schema garantisce la presenza dei campi obbligatori (`title`, `spaceKey`, `parentId`) e applica i valori di default.

### 5. Generazione Output

Viene generato un unico file **JSON** finale (`--output-file`) che contiene il payload strutturato:

- `metadata`: L'oggetto finale (validato e normalizzato).
- `markdownBody`: Il testo del runbook con i placeholder risolti.

---

## Tecnologie e Formati

| Componente              | Formato      | Libreria / Meccanismo | Ruolo                                     |
| :---------------------- | :----------- | :-------------------- | :---------------------------------------- |
| **Metadati Sorgente**   | **YAML**     | `gray-matter`         | Definizione dei parametri nel file `.md`. |
| **Asset Metadati**      | **JSON**     | `JSON.parse`          | Frammenti di configurazione condivisi.    |
| **Corpo / Asset Testo** | **Markdown** | Regex replacement     | Contenuto testuale del runbook.           |
| **Validazione**         | -            | `Zod`                 | Controllo di integrità dei dati finali.   |
| **Output Finale**       | **JSON**     | `JSON.stringify`      | Payload per le API di pubblicazione.      |

---

## Utilizzo

```shell
pnpm --filter=go-prepare-runbook dev -- \
  --input-file <percorso-file-md> \
  --shared-assets-dir <percorso-directory-asset> \
  --output-file <percorso-output-json>
```

### Esempio di Struttura Frontmatter

```yaml
---
title: 'Titolo Runbook'
spaceKey: 'GO'
parentId: '123456789'
assets:
  - shared-metadata-snippet # Carica metadati da shared-metadata-snippet.json
---
```

## Gestione degli Asset (`--shared-assets-dir`)

Gli asset sono file esterni che vengono caricati dallo script per essere riutilizzati in più runbook. L'origine di un asset è determinata dal suo **nome file** (senza estensione) all'interno della directory specificata:

- Un file `shared-metadata-snippet.json` definisce l'asset con ID `shared-metadata-snippet`.
- Un file `standard-deploy-instructions.md` definisce l'asset con ID `standard-deploy-instructions`.

### Esempio di Placeholder nel Corpo

Nel corpo del runbook, puoi richiamare un asset di testo usando la sintassi `{{ id_asset }}`. Ad esempio:

```markdown
# Istruzioni Operative

{{ standard-deploy-instructions }}
```

Durante l'esecuzione, lo script cercherà il file `standard-deploy-instructions.md` nella cartella degli asset e sostituirà il placeholder con il suo intero contenuto.
