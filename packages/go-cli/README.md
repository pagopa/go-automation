# GO Automation CLI (go-cli)

> Il Control Plane unificato per l'ecosistema GO Automation di PagoPA.
> Smetti di destreggiarti tra i comandi pnpm --filter. Inizia ad automatizzare.

`go-cli` è l'intelligenza centrale del monorepo GO Automation. Fornisce un'interfaccia di alto livello e interattiva per scoprire, ispezionare ed eseguire script di automazione in tutti i domini (go/, send/, interop/) con attrito zero.

---

## Vantaggi di `go-cli`

In un monorepo in rapida crescita, trovare lo strumento giusto non dovrebbe essere la parte più difficile del lavoro. `go-cli` risolve questo problema fornendo:

- **Quick Find (Novità)**: Ricerca fuzzy pesata ultra-veloce alimentata da Fuse.js. Trova qualsiasi script tramite il suo ID, nome, descrizione o parole chiave in millisecondi.
- **Autodiscovery**: Nessun file di configurazione da mantenere. Basta aggiungere uno script seguendo il pattern dei 3 file, e `go-cli` lo troverà automaticamente.
- **Esecuzione Guidata**: Non sei sicuro dei parametri necessari per uno script? Eseguilo in modalità interattiva e lascia che la CLI ti guidi attraverso le opzioni richieste.
- **AWS SSO Integrato**: Validazione automatica della sessione. Riconosce se il profilo AWS è scaduto e suggerisce esattamente come risolvere prima ancora di lanciare lo script.
- **Domain-Aware**: Gestisce senza problemi l'esecuzione degli script da sorgente (TypeScript) o distribuzione (JavaScript), garantendo la risoluzione coerente dei path e la configurazione dell'ambiente.

---

## Iniziare

### Prerequisiti

| Strumento | Versione |
| :--- | :--- |
| **Node.js** | >= 22.14.0 (Standard monorepo) |
| **pnpm** | >= 10.28.0 |
| **AWS CLI** | Configurato con SSO |

### Installazione

Per rendere `go-cli` disponibile globalmente nel sistema:

1. **Compila il monorepo**: `pnpm build`
2. **Crea il link globale**: `cd packages/go-cli && pnpm link --global`

Ora puoi digitare `go-cli` da qualsiasi cartella nel terminale.

---

## Utilizzo

### 1. Quick Find Interattivo (Consigliato)

Esegui `go-cli` senza argomenti per entrare nell'hub interattivo.

```bash
go-cli
```

*Usa la ricerca fuzzy per saltare immediatamente a qualsiasi script nel repository.*

### 2. Esecuzione Diretta

Se conosci già i parametri, puoi saltare il menu:

```bash
# Esegui uno script da sorgente (Default)
go-cli send-query-dynamodb --table my-table

# Esegui uno script compilato (per test simili alla produzione)
go-cli --dist go-report-alarms --sd 2025-01-01
```

### 3. Ispezione Script

Vuoi vedere cosa fa uno script senza eseguirlo?

```bash
go-cli info send-import-notifications
```

---

## Per i Collaboratori: Aggiungere un nuovo Script

Aggiungere un nuovo strumento all'ecosistema è immediato:

1. **Scaffolding**: Usa `bins/create-script.sh` per generare la struttura a 3 file.
2. **Metadata**: Definisci l'identità dello script in `src/config.ts`:

    ```typescript
    export const scriptMetadata: GOScriptMetadata = {
      id: 'mio-nuovo-tool',
      name: 'Il mio nuovo strumento potente',
      description: 'Esegue operazioni incredibili automaticamente.',
      keywords: ['athena', 's3', 'cleanup'] // Ricercabile tramite Quick Find!
    };
    ```

3. **Fine**: `go-cli` lo rileverà alla prossima esecuzione. Nessuna registrazione manuale richiesta.

---

## Eccellenza Tecnica

- **TypeScript Rigoroso**: Politica zero any. Sicurezza dei tipi dalla CLI fino alla logica core.
- **Risoluzione Smart dei Path**: Gli script vedono sempre i percorsi relativi alla loro posizione, eliminando i bug legati al contesto di esecuzione.
- **Osservabilità**: Integrato con il sistema di logging di go-common. Ogni esecuzione è strutturata, tracciabile e reportabile.

---

**Ultimo aggiornamento**: 2026-04-19
**Maintainer**: Team GO - Gestione Operativa
