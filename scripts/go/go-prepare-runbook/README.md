# GO Prepare Runbook

Questo script automatizza l'ingestion, il merging e la validazione di file Markdown contenenti YAML frontmatter, producendo un payload JSON garantito per la fase di pubblicazione.

## Funzionalità

- Parsing Frontmatter: Estrae metadati YAML e contenuto Markdown tramite gray-matter.
- Merging Asset Condivisi:
  - Carica metadati da file .json e contenuti da file .md dalla directory specificata.
  - Unisce metadati da file .json referenziati nell'array assets del frontmatter.
  - In caso di chiavi di metadati duplicate tra diversi asset, l'ultimo asset elaborato sovrascrive i valori precedenti (shallow merge).
  - Sostituisce placeholder {{ asset_id }} nel corpo Markdown con contenuti da file .md, dove asset_id corrisponde al nome del file (senza estensione).
  - Se un asset referenziato non viene trovato, verrà registrato un avviso e il placeholder rimarrà invariato.
  - La directory degli asset supporta file .json e .md; altri tipi di file verranno ignorati.
- Validazione Stretta: Utilizza zod per garantire la presenza e il tipo dei campi obbligatori (title, spaceKey, parentPageId).

## Utilizzo

```shell
pnpm --filter=go-prepare-runbook dev -- \
  --input-file <percorso-file-md> \
  --shared-assets-dir <percorso-directory-asset> \
  --output-file <percorso-output-json>
```

## Parametri

- **--shared-assets-dir (-s)**: Directory contenente gli asset condivisi (.json per metadati, .md per snippet di contenuto).
  - I file .json e .md in questa directory verranno caricati. Il nome del file (senza estensione) è usato come ID per il riferimento nel frontmatter (assets) o nei placeholder ({{ asset_id }}).
  - In caso di chiavi di metadati duplicate tra diversi asset JSON, l'ultimo asset elaborato sovrascrive i valori precedenti (shallow merge).
- **--input-file (-i)**: Percorso del file Markdown grezzo.
- **--output-file (-o)**: Percorso dove verrà scritto il JSON finale.

## Struttura Frontmatter Esempio

```yaml
---
 title: 'Titolo Runbook'
 spaceKey: 'GO'
 parentPageId: '123456789'
 version: '1.2.0'
 assets:

- shared-metadata-snippet # Corrisponde a shared-metadata-snippet.json o .md
- deployment-instructions-snippet # Corrisponde a deployment-instructions-snippet.md
---
```

## Contenuto del Runbook

```shell
{{ deployment-instructions-snippet }} # Sostituito con il contenuto di deployment-instructions-snippet.md
```
