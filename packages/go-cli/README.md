# GO Automation CLI (go-cli)

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Il Control Plane centralizzato per la scoperta e l'esecuzione degli script di automazione nel monorepo. Sostituisce i comandi `pnpm --filter` con un'interfaccia intuitiva e interattiva.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Utilizzo Globale](#utilizzo-globale)
- [Utilizzo](#utilizzo)
- [Esempi Pratici](#esempi-pratici)
- [Troubleshooting](#troubleshooting)

## Funzionalità

- **Discovery Automatica**: Scansiona la directory `scripts/` e registra automaticamente ogni script che segue il pattern dei 3 file.
- **Interfaccia Interattiva**: Menu di ricerca ricercabile (autocomplete) se invocato senza argomenti.
- **Modalità di Esecuzione**:
  - `source` (Default): Esegue direttamente i file TypeScript tramite `tsx`.
  - `dist`: Esegue i file compilati JavaScript dalla cartella `dist/`.
- **Ispezione Script**: Comando `info` per visualizzare metadati e parametri senza eseguire lo script.
- **Help Dinamico**: Genera automaticamente la documentazione dei parametri CLI per ogni script.

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                 |
| ---------- | --------------- | -------------------- |
| Node.js    | >= 22.14.0      | Versione monorepo    |
| pnpm       | >= 10.28.0      | Package manager      |
| TypeScript | >= 5.0.0        | Incluso nel progetto |

## Utilizzo Globale

Per rendere il comando `go-cli` disponibile ovunque nel sistema, è consigliato utilizzare il meccanismo nativo di `pnpm link`.

### Installazione Globale (Link)

1. Assicurati di aver compilato il progetto almeno una volta:

    ```bash
    pnpm build
    ```

2. Entra nella cartella del pacchetto:

    ```bash
    cd packages/go-cli
    ```

3. Crea il link globale:

    ```bash
    pnpm link --global
    ```

Ora puoi invocare `go-cli` da qualsiasi cartella del tuo sistema. Qualsiasi modifica al codice nel monorepo sarà immediatamente riflessa nel comando globale (grazie al symlink).

### Disinstallazione

Per rimuovere il comando globale:

```bash
pnpm uninstall --global @go-automation/go-cli
```

## Utilizzo

### Modalità Interattiva

Lancia il menu di selezione:

```bash
pnpm go
# oppure, se hai configurato l'alias:
go-cli
```

### Esecuzione Diretta

```bash
# Esecuzione da sorgente (default)
go-cli [nome-script] [opzioni-script]

# Esecuzione da build
go-cli --dist [nome-script] [opzioni-script]
```

### Ispezione Script

```bash
go-cli info [nome-script]
```

## Esempi Pratici

### Esempio 1: Analisi Allarmi

```bash
go-cli go-report-alarms --sd 2024-01-01T00:00:00Z --ed 2024-01-31T23:59:59Z
```

### Esempio 2: Visualizzazione Help di uno Script

```bash
go-cli send-check-ecs --help
```

### Esempio 3: Modalità Dist per validazione build

```bash
go-cli --dist go-report-alarms --sd 2024-01-01T00:00:00Z --ed 2024-01-31T23:59:59Z
```

## Troubleshooting

### Errore: "Script not found"

**Causa**: Lo script non è stato correttamente scoperto o non segue il pattern dei 3 file (manca `src/config.ts`).
**Soluzione**: Verifica che lo script esporti `scriptMetadata` e `scriptParameters` in `src/config.ts`.

### Errore: "Dist entry point not found"

**Causa**: Stai cercando di eseguire in modalità `--dist` ma lo script non è stato compilato.
**Soluzione**: Esegui `pnpm build` o `pnpm --filter [nome-script] build`.

---

**Ultima modifica**: 2026-04-06
**Maintainer**: Team GO - Gestione Operativa
