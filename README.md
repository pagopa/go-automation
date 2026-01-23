# GO Automation

Repository centralizzato per gli script di automazione e gestione operativa del team **GO** (Gestione Operativa) per i prodotti **SEND**, **INTEROP** e strumenti interni.

## Quick Start

```bash
# Clone del repository
git clone git@github.com:pagopa/go-automation.git
cd go-automation

# Installazione dipendenze
pnpm install

# Build della libreria comune
pnpm build:common

# Esegui uno script
pnpm --filter=go-report-alarms dev -- --help
```

## Documentazione

| Documento | Descrizione |
|-----------|-------------|
| [**Onboarding**](docs/ONBOARDING.md) | **Guida rapida per i nuovi sviluppatori (Setup IDE, AWS SSO)** |
| [Architettura](docs/ARCHITECTURE.md) | Struttura del monorepo, workspace pnpm, build system |
| [go-common](docs/GOCOMMON.md) | Documentazione della libreria `@go-automation/go-common` |
| [Coding Guidelines](docs/GUIDE_LINES.md) | Standard di codifica, naming conventions, best practices |
| [Creare Nuovi Script](docs/NEW_SCRIPT.md) | Guida passo-passo per creare nuovi script |
| [**Deploy**](docs/DEPLOY.md) | **Guida alla pacchettizzazione e rilascio degli script** |
| [**Troubleshooting**](docs/TROUBLESHOOTING.md) | **Soluzioni ai problemi comuni e FAQ** |

## Struttura del Repository

```
go-automation/
├── packages/
│   └── go-common/              # Libreria condivisa @go-automation/go-common
├── scripts/
│   ├── go/                     # Script per team GO
│   │   └── go-report-alarms/   # Analisi allarmi CloudWatch
│   ├── send/                   # Script per team SEND
│   │   ├── send-monitor-tpp-messages/
│   │   └── send-import-notifications/
│   └── interop/                # Script per team INTEROP (futuro)
├── docs/                       # Documentazione
├── bins/                       # Script di utility (scaffolding)
├── tsconfig.base.json          # Configurazione TypeScript condivisa
├── pnpm-workspace.yaml         # Configurazione workspace pnpm
└── package.json                # Root package.json
```

## Comandi Principali

### Build

```bash
pnpm build              # Build tutti i package
pnpm build:common       # Build solo go-common
pnpm build:scripts      # Build solo gli script
```

### Esecuzione Script

```bash
# Dev mode (con tsx, senza build)
pnpm --filter=<script-name> dev -- [options]

# Production mode (build + node)
pnpm --filter=<script-name> start -- [options]
```

### Creazione Nuovo Script

```bash
./bins/create-script.sh
```

## Requisiti

| Software | Versione |
|----------|----------|
| Node.js  | >= 24.0.0 |
| pnpm     | >= 10.0.0 |
| Git      | qualsiasi |

## Convenzioni di Naming

Gli script seguono il pattern: `{prodotto}-{verbo}-{descrizione}`

- **Prodotti**: `go`, `send`, `interop`
- **Verbi**: `check`, `monitor`, `fetch`, `update`, `manage`, `generate`, `sync`, `import`, `export`, `analyze`

Esempi:
- `go-report-alarms` - Genera report allarmi CloudWatch
- `send-import-notifications` - Importa notifiche SEND
- `send-monitor-tpp-messages` - Monitora messaggi TPP

## Team e Contatti

**Team**: GO - Gestione Operativa (PagoPa)

---

**Ultima modifica**: 2026-01-21
