# go-ai

GO-AI: modulo Bedrock per operational intelligence, usato dagli script e
dalle Lambda del repository che hanno bisogno di invocare un modello
linguistico.

## Responsabilità

Il package espone un client sottile sopra la Converse API di Amazon
Bedrock (`GOBedrockClient`), un set di prompt predefiniti selezionabili
tramite "hat" (`GOAIHat`: `normal`, `gherkin`, `srs-analysis`,
`code-review`, `runbook-assist`, `alarm-diagnosis`, `semantic-match`,
definiti in `prompts.yaml`), e due utility di parsing dell'output:
`GOAIOutputParser` (estrae JSON o testo da una risposta fenced) e
`GOAISemanticMatcher` (usa l'hat `semantic-match` per confrontare due
testi e produrre un verdetto `equivalent`/`conflicting`).

La risoluzione delle credenziali AWS segue l'ordine: opzione `profile`
esplicita → variabile d'ambiente `AWS_PROFILE` → default credential chain
(IAM Role, usato in Lambda).

Consumato da:

- `scripts/go/go-ai-client` — CLI che espone tutti gli hat da riga di comando.
- `scripts/go/go-rta-check` — usa `GOAISemanticMatcher` per il matching
  degli analysis draft.
- `packages/go-watchtower-runbook` — stesso matcher, per il confronto
  runbook/census.
- `functions/go-AILambda` — wrapper Lambda che invoca `GOBedrockClient`
  direttamente o tramite relay da Slack.

## Esempio

```typescript
import { GOBedrockClient, GOAIHat } from '@go-automation/go-ai';

const client = new GOBedrockClient({ profile: 'go-core-dev' });
const response = await client.invoke({ hat: GOAIHat.Normal, input: 'Riassumi questo testo...' });
```

## Test e build

```bash
pnpm --filter=@go-automation/go-ai test
pnpm --filter=@go-automation/go-ai build
```
