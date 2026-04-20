# GO Automation CLI (go-cli)

> Control Plane centralizzato per l'ecosistema di script GO Automation di PagoPA.

`go-cli` fornisce un'interfaccia di alto livello e interattiva per scoprire, ispezionare ed eseguire script di automazione in tutti i domini (**go/**, **send/**, **interop/**).

---

## Funzionalità Principali

In un monorepo in crescita, trovare lo script giusto fra tanti può diventare difficile. Per far fronte a tale scenario, `go-cli` fornisce un piano di controllo unificato che offre:

- **Autodiscovery**: se viene aggiunto un nuovo script seguendo il pattern dei 3 file, `go-cli` lo troverà automaticamente alla sua prossima esecuzione.
- **Ricerca Rapida**: ricerca alimentata da Fuse.js, trova script basandosi su ID, nome, parole chiave o descrizione, senza bisogno di conoscere il nome completo dello script.
- **Esecuzione Guidata**: se non si conoscono i parametri necessari per uno script, eseguendo `go-cli` in modalità interattiva si verrà guidati attraverso le opzioni richieste.
- **Modalità Sorgente/Distribuzione**: permette l'esecuzione da sorgente (TypeScript) o da distribuzione (JavaScript) a seconda delle necessità.

### Criteri di Rilevamento

Affinché uno script venga registrato correttamente, deve risiedere in una sottocartella di `scripts/` (es. `scripts/send/send-check-ecs/`) e rispettare rigorosamente il pattern dei 3 file:

- `src/config.ts`: deve esportare obbligatoriamente `scriptMetadata` (con ID univoco) e `scriptParameters`.
- `src/main.ts`: contiene la logica di business esportata come funzione `main`.
- `src/index.ts`: entry point dello script, responsabile della gestione dei parametri di configurazione.

### Discovery Cache

Per evitare problemi di performance dovuti alla scansione ricorsiva dell'intero monorepo, `go-cli` mantiene una cache locale in `packages/go-cli/.discovery-cache.json`, aggiornata automaticamente ad ogni esecuzione.

1. **Scansione delle Directory**: all'avvio, `go-cli` esplora ricorsivamente la cartella `scripts/` alla ricerca di sottocartelle che contengono il file src/config.ts.
2. **Validazione Strutturale**: una cartella viene considerata "script valido" solo se rispetta il pattern dei 3 file (**index.ts**, **config.ts**, **main.ts**).
3. **Controllo della Cache (.discovery-cache.json)**:
   - **Nuovi Script**: se un percorso non è presente nella cache, viene analizzato immediatamente.
   - **Modifiche ai Metadati**: `go-cli` confronta la data di ultima modifica (**mtime**) del file `src/config.ts` dello script con quella memorizzata nella cache.
   - **Invalidazione**: se il file è più recente della cache, `go-cli` riesegue il parsing del file per estrarre i nuovi scriptMetadata e scriptParameters.
4. **Estrazione dei Metadati**: l'estrazione avviene tramite importazione dinamica dei moduli TypeScript (grazie a tsx). Questo permette a `go-cli` di leggere gli oggetti `scriptMetadata` (inclusi **id**, **name**, **description**, **keywords**) e `scriptParameters` definiti in fase di sviluppo dello script.
5. **Aggiornamento Persistente**: una volta terminata la scansione, la cache viene aggiornata su disco per le esecuzioni successive.

### Gestione dei Preset

I Preset permettono di catturare la complessità dei parametri CLI e trasformarla in configurazioni riutilizzabili.

#### Funzionamento Tecnico

- **Salvataggio**: al termine di un'esecuzione avvenuta con successo in modalità interattiva, `go-cli` propone di salvare gli argomenti utilizzati.
- **Storage**: i preset sono memorizzati in `packages/go-cli/.go-cli-presets.json` e sono legati all'ID univoco dello script.
- **Utilizzo**: possono essere richiamati tramite il menu interattivo o direttamente da riga di comando con il flag `--preset [nome]`. Se un preset viene invocato via CLI, i suoi argomenti vengono "iniettati" prima di quelli forniti manualmente, permettendo l'override parziale.

### Diagnostica e Pre-flight Check

Prima di eseguire qualsiasi logica di business, `go-cli` agisce come uno strato di protezione per l'utente:

- **Verifica Integrità**: controlla che gli entry point (sorgenti o build) siano accessibili. Per esempio, se si invoca uno script con l'opzione `--dist` senza aver compilato, `go-cli` blocca l'esecuzione con un suggerimento chiaro sul comando di build da lanciare.
- **Check AWS SSO**: Se lo script è identificato come utilizzatore di risorse AWS (tramite metadati o parametri), `go-cli` verifica la presenza di un profilo attivo in `AWS_PROFILE`.
- **Gestione Sessione**: In caso di credenziali AWS scadute, `go-cli` non si limita a fallire, ma intercetta l'errore e guida l'utente verso `aws sso login`.

### Help Dinamico e Parametri

`go-cli` genera un'interfaccia di aiuto (`--help`) specifica per ogni script leggendo le definizioni dei parametri in `src/config.ts`:

- Validazione Tipi: Rileva se un parametro deve essere numerico, booleano o stringa prima di passare l'esecuzione allo script.
- Default e Descrizioni: Mostra chiaramente i valori predefiniti e le istruzioni d'uso fornite dallo sviluppatore dello script.

---

## Avvio

### Prerequisiti

| Strumento   | Versione                       |
| :---------- | :----------------------------- |
| **Node.js** | >= 22.14.0 (Standard monorepo) |
| **pnpm**    | >= 10.28.0                     |
| **AWS CLI** | Configurato con SSO            |

### Installazione

Per rendere `go-cli` disponibile globalmente nel sistema:

1. **Compilare il monorepo**: `pnpm build`
2. **Creare il link globale**: `cd packages/go-cli && pnpm link --global`

Ora è possibile digitare `go-cli` da qualsiasi cartella nel terminale.

---

## Utilizzo

### 1. Quick Find Interattivo

Eseguire `go-cli` da terminale, senza argomenti, permette di accedere all'interfaccia interattiva.

```bash
go-cli
```

### 2. Esecuzione Diretta

Se si conoscono già i parametri, è possibile invocare direttamente lo script:

```bash
# Esegui uno script da sorgente (Default)
go-cli send-check-ecs --aws-profiles send-core-test

# Esegui uno script compilato (per test simili alla produzione)
go-cli --dist send-check-ecs --aws-profiles send-core-test
```

### 3. Aiuto e Info Script

Per un aiuto rapido su uno script:

```bash
go-cli help send-check-ecs
```

Per maggiori dettagli su uno script:

```bash
go-cli inspect send-check-ecs
```

---

## Aggiungere un nuovo Script

Aggiungere un nuovo strumento all'ecosistema è immediato:

1. **Scaffolding**: usare `bins/create-script.sh` o il comando `go-cli new`per generare la struttura a 3 file.
2. **Metadata**: definire l'identità dello script in `src/config.ts` come da seguente esempio:

   ```typescript
   export const scriptMetadata: GOScriptMetadata = {
     id: 'mio-nuovo-tool',
     name: 'Il mio nuovo strumento potente',
     description: 'Esegue operazioni incredibili automaticamente.',
     keywords: ['athena', 's3', 'cleanup'], // Ricercabile tramite Quick Find!
   };
   ```

3. **Fine**: `go-cli` lo rileverà alla prossima esecuzione, nessuna registrazione manuale richiesta.

---

**Ultimo aggiornamento**: 2026-04-19
**Maintainer**: Team GO - Gestione Operativa
