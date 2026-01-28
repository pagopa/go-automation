# README Template per Script GO Automation

> **Guida per la creazione di documentazione standardizzata**
>
> Questo template definisce la struttura obbligatoria per tutti i README degli script nel monorepo GO Automation.

---

## Struttura del Template

````markdown
# [Nome Script]

> Versione: X.Y.Z | Autore: Team GO - Gestione Operativa

Breve descrizione dello script (1-2 frasi che spiegano cosa fa).

## Indice

- [Funzionalita](#funzionalita)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalita

Elenco delle funzionalita principali:

- Funzionalita 1
- Funzionalita 2
- Funzionalita 3

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                 |
| ---------- | --------------- | -------------------- |
| Node.js    | >= 18.0.0       | LTS consigliata      |
| pnpm       | >= 8.0.0        | Package manager      |
| TypeScript | >= 5.0.0        | Incluso nel progetto |

### Account e Permessi

- [ ] Accesso AWS con profilo SSO configurato
- [ ] Permessi IAM necessari (elencare)
- [ ] (Opzionale) Token Slack per notifiche

### Credenziali AWS

Descrivere come configurare le credenziali AWS (profili SSO, IAM, etc.)

## Configurazione

### Parametri CLI

| Parametro      | Alias | Tipo   | Obbligatorio | Default | Descrizione |
| -------------- | ----- | ------ | ------------ | ------- | ----------- |
| `--param.name` | `-p`  | string | Si           | -       | Descrizione |

### Variabili d'Ambiente

| Variabile  | Descrizione | Esempio  |
| ---------- | ----------- | -------- |
| `VAR_NAME` | Descrizione | `valore` |

### File di Configurazione

Percorso: `configs/config.json` o `configs/config.yaml`

```json
{
  "chiave": "valore",
  "nested": {
    "chiave": "valore"
  }
}
```
````

### Priorita di Configurazione

1. Parametri CLI (priorita massima)
2. Variabili d'ambiente
3. File di configurazione
4. Valori di default

## Utilizzo

### Modalita Development (via pnpm/tsx)

```bash
# Dalla root del monorepo
pnpm [nome-shortcut]

# Oppure con filter
pnpm --filter=[nome-script] dev

# Con parametri
pnpm [nome-shortcut] -- --param valore
```

### Modalita Production (build + node)

```bash
# Build
pnpm --filter=[nome-script] build

# Esecuzione
pnpm --filter=[nome-script] start

# Oppure direttamente
node dist/index.js --param valore
```

### Modalita Standalone

```bash
# Quando deployato separatamente
node dist/index.js --param valore
```

### Modalita Docker (se applicabile)

```bash
# Build immagine
docker compose build

# Esecuzione
docker compose run --rm app

# Shell interattiva
docker compose run --rm app /bin/sh
```

### Esempi Pratici

```bash
# Esempio 1: Caso d'uso comune
pnpm [comando] -- --param1 valore1 --param2 valore2

# Esempio 2: Con date
pnpm [comando] -- --from "2024-01-01T00:00:00Z" --to "2024-01-31T23:59:59Z"

# Esempio 3: Modalita verbose
pnpm [comando] -- --verbose
```

## Output

### Formato Report

Descrivere il formato dell'output generato:

- **File CSV**: `reports/report_YYYY-MM-DD_HH-MM-SS.csv`
- **Notifiche Slack**: Formato del messaggio
- **Log**: `logs/[nome-script]_YYYY-MM-DD.log`

### Esempio Output Console

```
╭─────────────────────────────────────────╮
│  [Nome Script] v1.0.0                   │
│  Team GO - Gestione Operativa           │
╰─────────────────────────────────────────╯

► Sezione 1
  Messaggio informativo...

► Sezione 2
  ✓ Operazione completata

► Risultati
  Totale: 100
  Elaborati: 95
  Errori: 5
```

## Troubleshooting

### Problemi Comuni

#### Errore: "AWS credentials not found"

**Causa**: Profilo AWS non configurato o sessione SSO scaduta.

**Soluzione**:

```bash
# Effettuare login SSO
aws sso login --profile [nome-profilo]
```

#### Errore: "Module not found"

**Causa**: Dipendenze non installate o build non eseguito.

**Soluzione**:

```bash
pnpm install
pnpm build:common
pnpm --filter=[nome-script] build
```

#### Errore: "Invalid date format"

**Causa**: Formato data non valido.

**Soluzione**: Usare formato ISO 8601: `YYYY-MM-DDTHH:MM:SSZ`

### Debug Mode

```bash
# Eseguire con debug output
DEBUG=* pnpm [comando]

# Type check senza build
pnpm --filter=[nome-script] exec tsc --noEmit
```

---

**Ultima modifica**: YYYY-MM-DD
**Maintainer**: Team GO - Gestione Operativa

```

---

## Note per l'Utilizzo del Template

1. **Sostituire i placeholder**: Tutti i testi tra `[parentesi quadre]` devono essere sostituiti
2. **Adattare le sezioni**: Non tutte le sezioni potrebbero essere necessarie per ogni script
3. **Mantenere l'italiano**: La documentazione deve essere in italiano
4. **Includere esempi reali**: Gli esempi devono essere funzionanti e testati
5. **Aggiornare la data**: Mantenere aggiornata la data di ultima modifica

## Sezioni Opzionali

- **Docker**: Solo se lo script supporta containerizzazione
- **Cron/Scheduling**: Solo se lo script supporta esecuzione schedulata
- **API Reference**: Solo per script con API complesse
- **Changelog**: Per script con versioning attivo
```
