# Troubleshooting Guide

Questa guida raccoglie soluzioni ai problemi comuni riscontrati lavorando sul monorepo `go-automation`.

## Problemi di Build e pnpm

### `Cannot find module '@go-automation/go-common'`

**Causa:** La libreria `go-common` non è stata compilata o non è linkata correttamente.
**Soluzione:**
1. Assicurati di aver fatto `pnpm install`.
2. Esegui la build esplicita della libreria:
   ```bash
   pnpm build:common
   ```

### `Composite project must reference core...`

**Causa:** Errore nella configurazione di TypeScript (`tsconfig.json`).
**Soluzione:**
Assicurati che il `tsconfig.json` del tuo script includa `composite: true` e referenzi `go-common`:
```json
"references": [
  { "path": "../../../packages/go-common" }
]
```

### `ERR_MODULE_NOT_FOUND` durante l'esecuzione

**Causa:** Import TypeScript senza estensione `.js` in un progetto ESM (`"type": "module"`).
**Soluzione:**
In TypeScript moderno ESM, gli import devono includere l'estensione `.js` anche se il file sorgente è `.ts`.
```typescript
// ❌ Errato
import { MyService } from './MyService';

// ✅ Corretto
import { MyService } from './MyService.js';
```

## Problemi AWS

### `ExpiredToken: The security token included in the request is expired`

**Causa:** La sessione SSO locale è scaduta.
**Soluzione:**
Rifare il login da terminale:
```bash
aws sso login --profile <tuo-profilo>
```

### `CredentialsProviderError: Could not load credentials from any providers`

**Causa:**
1. Non hai fatto login SSO.
2. Il parametro `--aws-profile` non corrisponde a nessun profilo in `~/.aws/config`.
3. Stai eseguendo in un ambiente (es. Docker) dove non ci sono credenziali iniettate.

**Soluzione:**
Verifica il profilo usato:
```bash
cat ~/.aws/config
```

## Problemi Docker / Standalone

### `exec user process caused: exec format error`

**Causa:** Stai cercando di eseguire un container buildato per un'architettura diversa (es. build su Mac M1/ARM64 ed esecuzione su Linux/AMD64).
**Soluzione:**
Quando buildi l'immagine Docker, usa `--platform`:
```bash
docker build --platform linux/amd64 -t my-script .
```

### Il container non trova `node_modules`

**Causa:** In modalità standalone, i `node_modules` non vengono copiati correttamente o non viene fatto `npm install` nell'artefatto.
**Soluzione:**
Usa sempre `bins/deploy.sh` per generare l'artefatto. Questo script usa `pnpm deploy` che appiattisce correttamente le dipendenze (incluse quelle del workspace) in una cartella pronta per l'uso.

## Altro

### VS Code non mostra errori TypeScript/ESLint

**Soluzione:**
1. Riavvia il TS Server: `Cmd+Shift+P` -> `TypeScript: Restart TS Server`.
2. Assicurati di aver aperto la root del monorepo (`go-automation`) e non una sottocartella come workspace root.

---
Se il problema persiste, apri una Issue o contatta il team GO su Slack.
