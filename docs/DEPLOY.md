# Deployment Guide

Questa guida spiega come preparare, pacchettizzare e rilasciare gli script di automazione.

## Overview del Processo

Il deployment di uno script dal monorepo segue questi step:

1.  **Build & Bundle**: Creazione di un artefatto "standalone" (isolato dal monorepo).
2.  **Containerizzazione**: Creazione di un'immagine Docker a partire dall'artefatto.
3.  **Infrastructure Deploy**: Aggiornamento dell'infrastruttura (Terraform/ECS) per usare la nuova immagine.

---

## 1. Build & Bundle (Standalone Artifact)

Il monorepo fornisce uno strumento dedicato per estrarre uno script e tutte le sue dipendenze (inclusa `go-common`) in una cartella isolata.

### Strumento: `bins/deploy.sh`

Questo script utilizza `pnpm deploy` per generare un pacchetto pronto per la produzione.

**Utilizzo Interattivo:**

```bash
./bins/deploy.sh
```

Ti verra mostrato un menu per selezionare lo script e la modalità (Production/Dev).

**Utilizzo CLI (CI/CD):**

```bash
# Esempio: Deploy di go-report-alarms in production mode
./bins/deploy.sh --prod --clean --script go-report-alarms
```

| Flag              | Descrizione                                             |
| ----------------- | ------------------------------------------------------- |
| `--prod`          | Esclude `devDependencies` (riduce dimensione)           |
| `--clean`         | Pulisce la cartella di destinazione prima del deploy    |
| `--script <name>` | Specifica il nome dello script (es. `go-report-alarms`) |

### Output

L'artefatto viene generato in: `artifacts/<script-name>/`

Contenuto tipico:

```
artifacts/go-report-alarms/
├── package.json         # Deps appiattite (go-common e ora una dipendenza file:)
├── dist/                # Codice compilato
├── configs/             # Configurazioni
├── node_modules/        # Tutte le dipendenze installate
└── ...
```

Questo artefatto e **completamente autonomo**: puo essere copiato su un server, in un container o zippato per AWS Lambda e funzionera con un semplice `node dist/main.js`.

---

## 2. Containerizzazione (Docker)

Il repository fornisce uno strumento automatizzato per creare immagini Docker ottimizzate e pronte per la produzione, basate sugli artefatti standalone.

### Strumento: `bins/build-image.sh`

Questo script orchestra l'intero processo:

1. Chiama `deploy.sh` per creare l'artefatto (clean + prod mode).
2. Usa `infra/docker/Dockerfile.runtime` (leggero e universale) per pacchettizzare l'artefatto.

**Utilizzo:**

```bash
# Sintassi: ./bins/build-image.sh <script-name> [tag]
./bins/build-image.sh send-monitor-tpp-messages v1.2.0
```

### Vantaggi

- **Veloce**: Non ricompila il codice dentro Docker. Usa i file gia compilati localmente da `pnpm`.
- **Leggero**: L'immagine finale contiene solo `dist/`, `node_modules/` (prod only) e `configs/`.
- **Sicuro**: Il codice sorgente TypeScript non viene incluso nell'immagine.
- **Non-root**: Il container gira come utente `gouser` per maggiore sicurezza.

### Caratteristiche dell'Immagine

L'immagine Docker (`infra/docker/Dockerfile.runtime`) include:

| Componente        | Descrizione                        |
| ----------------- | ---------------------------------- |
| Node.js 24-alpine | Runtime leggero                    |
| tzdata            | Supporto timezone                  |
| ca-certificates   | Certificati SSL/TLS                |
| aws-cli           | AWS credential chain e comandi CLI |

**Nota**: Lo scheduling cron viene gestito da Node.js (libreria `croner`), non da un daemon di sistema come dcron. Questo elimina la necessita di permessi root.

---

## 3. Struttura Docker per Script

Ogni script che supporta l'esecuzione in Docker ha una propria directory `docker/` con configurazione dedicata.

### Struttura Directory

```
scripts/send/send-monitor-tpp-messages/
├── src/
│   ├── index.ts        # Entry point principale
│   └── cron.ts         # Scheduler per modalità cron
├── docker/
│   ├── docker-compose.yml   # Configurazione servizi
│   └── .env.example         # Template variabili d'ambiente
├── reports/                 # Output (volume montato)
└── package.json
```

### File docker-compose.yml

Il file docker-compose.yml definisce due servizi:

1. **app**: Servizio per esecuzioni singole (interattive)
2. **scheduled**: Servizio per esecuzioni programmate (cron)

```yaml
services:
  # Esecuzione singola (RUN_MODE=once)
  app:
    image: go-automation/script-name:${IMAGE_TAG:-latest}
    env_file: .env
    environment:
      RUN_MODE: once
    volumes:
      - ../reports:/app/reports:rw
    restart: 'no'

  # Esecuzione schedulata (RUN_MODE=cron)
  scheduled:
    image: go-automation/script-name:${IMAGE_TAG:-latest}
    env_file: .env
    environment:
      RUN_MODE: cron
      CRON_SCHEDULE: ${CRON_SCHEDULE:-0 9,11,15,17 * * *}
    restart: unless-stopped
    profiles:
      - scheduled
```

### File .env

Copia il template e configura le variabili:

```bash
cd scripts/send/send-monitor-tpp-messages/docker/
cp .env.example .env
# Modifica .env con i tuoi valori
```

**Importante**: Il file `.env` e gitignored e non deve mai essere committato.

---

## 4. Modalità di Esecuzione (RUN_MODE)

Il container supporta tre modalità di esecuzione, controllate dalla variabile d'ambiente `RUN_MODE`:

### once (default)

Esegue lo script una volta e termina. Ideale per:

- Test manuali
- Esecuzioni interattive
- CI/CD pipelines

```bash
docker run --rm \
  -e RUN_MODE=once \
  go-automation/send-monitor-tpp-messages:latest
```

Con argomenti CLI:

```bash
docker run --rm \
  go-automation/send-monitor-tpp-messages:latest \
  --from 2025-01-01 --to 2025-01-15
```

### cron

Mantiene il container attivo e esegue lo script secondo lo schedule definito. Usa la libreria Node.js `croner` per lo scheduling.

**Vantaggi rispetto al cron di sistema:**

- Non richiede permessi root
- Nativo Node.js, nessuna dipendenza esterna
- Supporta timezone
- Graceful shutdown su SIGTERM/SIGINT

```bash
docker run -d \
  -e RUN_MODE=cron \
  -e CRON_SCHEDULE="0 9,11,15,17 * * *" \
  -e TZ=Europe/Rome \
  go-automation/send-monitor-tpp-messages:latest
```

Il formato cron e standard: `MIN HOUR DAY MONTH WEEKDAY`

Esempi di schedule:
| Schedule | Descrizione |
|----------|-------------|
| `0 9 * * *` | Ogni giorno alle 9:00 |
| `0 9,11,15,17 * * *` | Alle 9, 11, 15, 17 ogni giorno |
| `*/30 * * * *` | Ogni 30 minuti |
| `0 8 * * 1-5` | Alle 8:00 nei giorni feriali |

### shell

Avvia una shell interattiva per debug:

```bash
docker run --rm -it \
  -e RUN_MODE=shell \
  go-automation/send-monitor-tpp-messages:latest
```

---

## 5. Helper Script: bins/docker-run.sh

Per semplificare la gestione dei container, usa lo script helper `bins/docker-run.sh`.

### Sintassi

```bash
./bins/docker-run.sh <script-name> <command> [options]
```

### Comandi Disponibili

| Comando | Descrizione                                    |
| ------- | ---------------------------------------------- |
| `run`   | Esegui script una volta (modalità interattiva) |
| `up`    | Avvia container in background                  |
| `down`  | Ferma e rimuovi container                      |
| `logs`  | Visualizza log del container                   |
| `shell` | Apri shell interattiva nel container           |
| `ps`    | Lista container in esecuzione                  |
| `build` | Build immagine + esegui                        |

### Opzioni

| Opzione        | Descrizione                              |
| -------------- | ---------------------------------------- |
| `--scheduled`  | Usa il profilo scheduled (modalità cron) |
| `--follow, -f` | Segui i log in tempo reale               |

### Esempi

**Esecuzione singola (interattiva):**

```bash
# Esegui script una volta
./bins/docker-run.sh send-monitor-tpp-messages run

# Esegui con argomenti
./bins/docker-run.sh send-monitor-tpp-messages run -- --from 2025-01-01

# Build immagine ed esegui
./bins/docker-run.sh send-monitor-tpp-messages build run
```

**Esecuzione schedulata (cron):**

```bash
# Avvia scheduler cron in background
./bins/docker-run.sh send-monitor-tpp-messages up --scheduled

# Visualizza log in tempo reale
./bins/docker-run.sh send-monitor-tpp-messages logs -f --scheduled

# Ferma scheduler
./bins/docker-run.sh send-monitor-tpp-messages down --scheduled
```

**Debug:**

```bash
# Apri shell nel container
./bins/docker-run.sh send-monitor-tpp-messages shell

# Stato container
./bins/docker-run.sh send-monitor-tpp-messages ps
```

---

## 6. Uso Diretto con Docker Compose

Se preferisci usare docker-compose direttamente:

```bash
cd scripts/send/send-monitor-tpp-messages/docker/
```

**Esecuzione singola:**

```bash
# Run interattivo
docker compose run --rm app

# Con argomenti
docker compose run --rm app --from 2025-01-01 --to 2025-01-15
```

**Esecuzione schedulata:**

```bash
# Avvia in background
docker compose --profile scheduled up -d

# Visualizza log
docker compose --profile scheduled logs -f

# Ferma
docker compose --profile scheduled down
```

---

## 7. Configurazione Credenziali AWS

### Sviluppo Locale (SSO)

Per testare localmente con credenziali AWS SSO:

1. Effettua login SSO:

   ```bash
   aws sso login --profile tuo-profilo
   ```

2. Monta la directory `.aws` nel container:

   ```bash
   docker run --rm \
     -e AWS_PROFILE=tuo-profilo \
     -v ~/.aws:/home/gouser/.aws:ro \
     go-automation/send-monitor-tpp-messages:latest
   ```

   Oppure decommenta la riga nel `docker-compose.yml`:

   ```yaml
   volumes:
     - ~/.aws:/home/gouser/.aws:ro
   ```

### Produzione (IAM Role)

In produzione su AWS ECS/Fargate, le credenziali sono fornite automaticamente dal Task Role IAM. Non e necessario montare volumi o configurare variabili AWS.

---

## 8. Infrastructure Deploy (Terraform)

L'infrastruttura di esecuzione e gestita tramite Terraform su AWS ECS (Fargate).
Il modulo di riferimento e in: `infra/terraform/modules/ecs-script`.

### Configurazione Modulo

Quando definisci un nuovo script in Terraform, usa il modulo `ecs-script`:

```hcl
module "go_report_alarms" {
  source = "../../modules/ecs-script"

  script_name = "go-report-alarms"
  environment = "prod"

  # Immagine Docker (URL ECR)
  ecr_repository_url = aws_ecr_repository.scripts.repository_url
  image_tag          = "v1.0.0"

  # Risorse
  cpu    = 256
  memory = 512

  # Configurazione
  environment_variables = [
    { name = "GO_DEPLOYMENT_MODE", value = "standalone" },
    { name = "LOG_LEVEL", value = "info" },
    { name = "RUN_MODE", value = "once" }
  ]

  # Scheduling (Opzionale)
  schedule_enabled    = true
  schedule_expression = "cron(0 8 * * ? *)" # Ogni giorno alle 8:00 UTC
}
```

### Variabili Chiave

- **`script_name`**: Deve corrispondere al nome della cartella in `artifacts/` o nel path Docker.
- **`schedule_expression`**: Sintassi EventBridge Cron. Se omesso, il task non viene schedulato (es. task manuale o one-off).
- **`environment_variables`**: Variabili iniettate nel container. `go-common` le usera per la configurazione.

---

## 9. Aggiungere Docker a uno Script Esistente

Per aggiungere il supporto Docker a uno script esistente:

### 1. Crea la directory docker/

```bash
mkdir -p scripts/<team>/<script-name>/docker
```

### 2. Crea docker-compose.yml

Usa il template da uno script esistente:

```bash
cp scripts/send/send-monitor-tpp-messages/docker/docker-compose.yml \
   scripts/<team>/<script-name>/docker/

# Modifica il file con il nome corretto dell'immagine
```

### 3. Crea .env.example

Documenta tutte le variabili d'ambiente necessarie:

```bash
cp scripts/send/send-monitor-tpp-messages/docker/.env.example \
   scripts/<team>/<script-name>/docker/

# Personalizza le variabili per il tuo script
```

### 4. Aggiungi cron.ts (se necessario)

Se lo script deve supportare la modalità cron:

```bash
cp scripts/send/send-monitor-tpp-messages/src/cron.ts \
   scripts/<team>/<script-name>/src/
```

Assicurati che `croner` sia nelle dipendenze:

```bash
cd scripts/<team>/<script-name>
pnpm add croner
```

### 5. Aggiorna tsconfig.json

Includi `cron.ts` nella compilazione se presente.

### 6. Build e Test

```bash
# Build immagine
./bins/build-image.sh <script-name> latest

# Test esecuzione singola
./bins/docker-run.sh <script-name> run

# Test modalità cron
./bins/docker-run.sh <script-name> up --scheduled
./bins/docker-run.sh <script-name> logs -f --scheduled
```

---

## CI/CD (GitHub Actions)

_Sezione da completare quando verranno implementati i workflow automatici._

Al momento, il flusso suggerito e:

1. Bump versione in `package.json` dello script.
2. Esecuzione `bins/build-image.sh` (Docker build).
3. Push immagine su ECR.
4. Aggiornamento tag in Terraform (`terraform apply`).

---

## Troubleshooting

### Il container non trova le credenziali AWS

**Sintomo**: Errori come `Unable to locate credentials`

**Soluzione**:

- Verifica che il profilo SSO sia valido: `aws sts get-caller-identity --profile tuo-profilo`
- Monta correttamente la directory `.aws`
- Verifica che il path sia `/home/gouser/.aws` (non `/root/.aws`)

### Lo scheduler cron non si avvia

**Sintomo**: Container termina immediatamente in modalità cron

**Soluzione**:

- Verifica che `CRON_SCHEDULE` sia impostata
- Controlla che il formato sia valido (5 campi: MIN HOUR DAY MONTH WEEKDAY)
- Verifica i log: `docker logs <container-name>`

### Permessi negati sui volumi

**Sintomo**: `Permission denied` quando si scrive su `/app/reports`

**Soluzione**:

- Il container gira come `gouser` (non root)
- Crea la directory reports localmente: `mkdir -p reports`
- Verifica i permessi: `chmod 777 reports` (solo per sviluppo locale)

### Immagine non trovata

**Sintomo**: `Error: No such image: go-automation/script-name:latest`

**Soluzione**:

```bash
# Build l'immagine
./bins/build-image.sh <script-name> latest

# Verifica
docker images | grep go-automation
```
