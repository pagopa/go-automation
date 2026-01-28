# Onboarding Guide

Benvenuto nel team **GO - Gestione Operativa**!
Questa guida ti aiuterà a configurare il tuo ambiente di sviluppo per lavorare sul monorepo `go-automation`.

## 1. Prerequisiti

Assicurati di avere installato il seguente software:

- **Node.js**: v24.0.0 o superiore (Consigliato l'uso di `nvm` o `fnm`)
- **pnpm**: v10.0.0 o superiore (`corepack enable` raccomandato)
- **Git**: Ultima versione stabile
- **AWS CLI v2**: Per l'autenticazione SSO (Fondamentale)
- **Visual Studio Code**: IDE raccomandato

### Setup AWS CLI (SSO)

La libreria `go-common` utilizza le credenziali AWS SSO. Configura il file `~/.aws/config`:

```ini
[profile sso_pn-core-dev]
sso_session = sso_pn
sso_account_id = <ACCOUNT_ID_CORE>
sso_role_name = <ROLE_NAME>
region = eu-south-1
output = json

[sso-session sso_pn]
sso_start_url = https://<SSO_URL>.awsapps.com/start
sso_region = eu-south-1
sso_registration_scopes = sso:account:access
```

Prima di eseguire qualsiasi script che interagisce con AWS, esegui il login:

```bash
aws sso login --profile sso_pn-core-dev
```

## 2. Installazione e Setup

### Clone del Repository

```bash
git clone git@github.com:pagopa/go-automation.git
cd go-automation
```

### Installazione Dipendenze

Il progetto usa `pnpm` workspace. Non usare `npm` o `yarn`.

```bash
pnpm install
```

### Build Iniziale

È necessario compilare la libreria condivisa `go-common` prima di poter lavorare su qualsiasi script.

```bash
# Build della libreria core
pnpm build:common

# (Opzionale) Build di tutti gli script
pnpm build
```

## 3. Configurazione IDE (VS Code)

Per una migliore esperienza di sviluppo, raccomandiamo l'installazione delle seguenti estensioni (alcune verranno suggerite all'apertura del progetto):

### Core & Linting

- **ESLint**: Per il controllo della qualità del codice.
- **Prettier**: Per la formattazione automatica.
- **npm intellisense**: Autocompletamento per le dipendenze in `package.json`.
- **DotENV**: Supporto alla sintassi per i file `.env`.
- **YAML (RedHat)**: Fondamentale per i file di config e pnpm workspaces.

### TypeScript Stack

- **JavaScript and TypeScript Nightly**: Per le ultime feature del linguaggio.
- **Pretty TypeScript Errors**: Rende gli errori TS molto più leggibili.

### Cloud & Infrastruttura

- **AWS Toolkit**: Gestione profili AWS, Lambda ed Explorer risorse.
- **Docker (Container Tools)**: Gestione container, immagini e Dockerfile.
- **Dev Containers**: Per lavorare dentro i container se previsto.

### Utilities & Documentazione

- **CSV (Edit csv)**: [Link Marketplace](https://marketplace.visualstudio.com/items?itemName=ReprEng.csv) - Ottimo per gestire i dati di input/output.
- **Markdown All in One**: Per gestire facilmente la documentazione del progetto.

Assicurati che `editor.formatOnSave` sia abilitato nelle tue impostazioni utente o workspace.

## 4. Eseguire uno Script

### Modalità Sviluppo (Dev Mode)

Usa `tsx` per eseguire TypeScript "al volo" senza compilazione.

```bash
# Esempio: Esegui go-report-alarms
pnpm --filter=go-report-alarms dev -- --help
```

### Modalità Produzione

Compila ed esegui il codice JS transpilato.

```bash
# 1. Build dello script
pnpm --filter=go-report-alarms build

# 2. Esegui
pnpm --filter=go-report-alarms start -- --aws-profile sso_pn-core-dev
```

## 5. Creare il tuo primo Script

Utilizza lo strumento di scaffolding integrato:

```bash
./bins/create-script.sh
```

Segui le istruzioni a video per generare la struttura del progetto. Consulta [NEW_SCRIPT.md](./NEW_SCRIPT.md) per i dettagli.

## 6. Risorse Utili

- [Architecture Overview](./ARCHITECTURE.md)
- [Coding Guidelines](./GUIDE_LINES.md)
- [Testing Strategy](./TESTING_STRATEGY.md)

---

**Hai problemi?** Consulta la guida [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
