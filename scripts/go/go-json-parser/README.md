# GO JSON Parser

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script di automazione per l'estrazione di campi specifici da file JSON e NDJSON, con supporto per la ricerca ricorsiva e output ordinato e unico.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Logica di Estrazione](#logica-di-estrazione)
- [Output](#output)

## Funzionalità

Lo script esegue le seguenti operazioni:

- **Supporto Multi-formato**: Gestisce sia file JSON standard (array di oggetti) che NDJSON (un oggetto per riga).
- **Rilevamento Automatico**: Identifica il formato tramite estensione (`.json`, `.ndjson`, `.jsonl`) e ispezione del contenuto.
- **Estrazione Flessibile**: Supporta la dot-notation per percorsi esatti e la ricerca ricorsiva come fallback.
- **Efficienza**: Utilizza lo streaming per i file NDJSON per gestire file di grandi dimensioni (centinaia di MB).
- **Pulizia Dati**: Rimuove i duplicati e ordina i risultati alfabeticamente.

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                 |
| ---------- | --------------- | -------------------- |
| Node.js    | >= 22.14.0      | LTS consigliata      |
| pnpm       | >= 10.0.0       | Package manager      |
| TypeScript | >= 5.0.0        | Incluso nel progetto |

## Configurazione

### Parametri CLI

| Parametro       | Alias | Tipo   | Obbligatorio | Descrizione                                                                   |
| --------------- | ----- | ------ | ------------ | ----------------------------------------------------------------------------- |
| `--input-file`  | `-i`  | string | Sì           | Percorso del file JSON o NDJSON da analizzare.                                |
| `--field`       | `-f`  | string | Sì           | Nome del campo da estrarre (es. `id`, `user.profile.email`).                  |
| `--output-file` | `-o`  | string | No           | Percorso del file di output (TXT). Default: `data/extracted_[timestamp].txt`. |

## Utilizzo

### Modalità Development (via pnpm/tsx)

```bash
pnpm go:json:parser:dev --input-file ./data/input.ndjson --field iun
```

### Modalità Production (build + node)

```bash
pnpm go:json:parser:prod --input-file ./data/input.json --field metadata.id --output-file ./data/ids.txt
```

## Logica di Estrazione

Lo script utilizza una strategia "Path-First with Recursive Fallback":

1. **Percorso Esatto**: Tenta di risolvere il campo usando il percorso fornito (es. `user.address.city`).
2. **Ricerca Ricorsiva**: Se il percorso non produce risultati, lo script cerca l'ultima parte della stringa (es. `city`) ricorsivamente all'interno di tutto l'oggetto.
3. **Salvataggio**: Se il valore viene trovato, viene convertito in stringa e aggiunto alla collezione dei risultati.

## Output

L'output è un file di testo (`.txt`) contenente i valori estratti, uno per riga, ordinati alfabeticamente e senza duplicati.

---

**Ultima modifica**: 2026-03-28
**Maintainer**: Team GO - Gestione Operativa
