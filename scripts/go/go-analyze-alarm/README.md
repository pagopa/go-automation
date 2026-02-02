# Go Analyze Alarm

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Analyzes an alarm, executes its associated runbook, and determines the correct operational outcome and next action based on collected evidence and known cases.

## Indice

- [Funzionalita](#funzionalita)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalita

Elenco delle funzionalita principali:

- TODO: Funzionalita 1
- TODO: Funzionalita 2
- TODO: Funzionalita 3

## Prerequisiti

### Software Richiesto

| Software | Versione Minima | Note |
|----------|-----------------|------|
| Node.js  | >= 18.0.0       | LTS consigliata |
| pnpm     | >= 8.0.0        | Package manager |
| TypeScript | >= 5.0.0      | Incluso nel progetto |

### Account e Permessi

- [ ] Accesso AWS con profilo SSO configurato
- [ ] Permessi IAM necessari (elencare)
- [ ] (Opzionale) Token Slack per notifiche

### Credenziali AWS

Configurare le credenziali AWS utilizzando AWS SSO:

```bash
aws sso login --profile <nome-profilo>
```

## Configurazione

### Parametri CLI

| Parametro | Alias | Tipo | Obbligatorio | Default | Descrizione |
|-----------|-------|------|--------------|---------|-------------|
| TODO: Aggiungere parametri | | | | | |

### Variabili d'Ambiente

| Variabile | Descrizione | Esempio |
|-----------|-------------|---------|
| TODO: Aggiungere variabili | | |

### File di Configurazione

Percorso: `configs/config.json`

```json
{
  "TODO": "Aggiungere configurazione"
}
```

### Priorita di Configurazione

1. Parametri CLI (priorita massima)
2. Variabili d'ambiente
3. File di configurazione
4. Valori di default

## Utilizzo

### Modalita Development (via pnpm/tsx)

```bash
# Dalla root del monorepo
pnpm go:analyze:alarm:dev

# Oppure con filter
pnpm --filter=go-analyze-alarm dev

# Con parametri
pnpm go:analyze:alarm:dev -- --param valore
```

### Modalita Production (build + node)

```bash
# Build
pnpm --filter=go-analyze-alarm build

# Esecuzione
pnpm --filter=go-analyze-alarm start

# Oppure direttamente
node dist/index.js --param valore
```

### Esempi Pratici

```bash
# Esempio 1: Caso d'uso comune
pnpm go:analyze:alarm:dev -- --param1 valore1 --param2 valore2

# Esempio 2: Con date
pnpm go:analyze:alarm:dev -- --from "2024-01-01T00:00:00Z" --to "2024-01-31T23:59:59Z"

# Esempio 3: Modalita verbose
pnpm go:analyze:alarm:dev -- --verbose
```

## Output

### Formato Report

Descrivere il formato dell'output generato:

- **File CSV**: `reports/report_YYYY-MM-DD_HH-MM-SS.csv`
- **Notifiche Slack**: Formato del messaggio
- **Log**: `logs/go-analyze-alarm_YYYY-MM-DD.log`

### Esempio Output Console

```
+-------------------------------------------+
|  Go Analyze Alarm v1.0.0                  |
|  Team GO - Gestione Operativa                            |
+-------------------------------------------+

> Sezione 1
  Messaggio informativo...

> Sezione 2
  [OK] Operazione completata

> Risultati
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
aws sso login --profile <nome-profilo>
```

#### Errore: "Module not found"

**Causa**: Dipendenze non installate o build non eseguito.

**Soluzione**:
```bash
pnpm install
pnpm build:common
pnpm --filter=go-analyze-alarm build
```

#### Errore: "Invalid date format"

**Causa**: Formato data non valido.

**Soluzione**: Usare formato ISO 8601: `YYYY-MM-DDTHH:MM:SSZ`

### Debug Mode

```bash
# Eseguire con debug output
DEBUG=* pnpm go:analyze:alarm:dev

# Type check senza build
pnpm --filter=go-analyze-alarm exec tsc --noEmit
```

---

**Ultima modifica**: 2026-02-01
**Maintainer**: Team GO - Gestione Operativa
