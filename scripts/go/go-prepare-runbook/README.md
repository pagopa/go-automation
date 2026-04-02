# GO Prepare Runbook

Questo script automatizza l'ingestion, il merging e la validazione di file Markdown contenenti YAML frontmatter, producendo un payload JSON garantito per la fase di pubblicazione.

## Funzionalità

- **Parsing Frontmatter**: Estrae metadati YAML e contenuto Markdown tramite `gray-matter`.
- **Merging Asset Condivisi**:
  - Unisce metadati da file `.json` referenziati nel frontmatter.
  - Sostituisce placeholder `{{ asset_name }}` nel Markdown con contenuti da file `.md`.
- **Validazione Stretta**: Utilizza `zod` per garantire la presenza e il tipo dei campi obbligatori (`title`, `spaceKey`, `parentPageId`).
- **Normalizzazione**: Applica valori di default per i campi opzionali.

## Utilizzo

```bash
pnpm --filter=go-prepare-runbook dev -- \
  --input-file <percorso-file-md> \
  --shared-assets-dir <percorso-directory-asset> \
  --output-file <percorso-output-json>
```

### Parametri

- `--input-file` (`-i`): Percorso del file Markdown grezzo.
- `--shared-assets-dir` (`-s`): Directory contenente gli asset condivisi (`.json` per metadati, `.md` per snippet di contenuto).
- `--output-file` (`-o`): Percorso dove verrà scritto il JSON finale.

## Struttura Frontmatter Esempio

```markdown
---
title: 'Titolo Runbook'
spaceKey: 'GO'
parentPageId: '123456789'
version: '1.2.0'
assets:
  - shared-metadata-snippet
---

# Contenuto del Runbook

{{ deployment-instructions-snippet }}
```
