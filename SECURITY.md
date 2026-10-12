# Security Policy

`go-automation` è uno strumento interno di automazione operativa per il
programma GO: esegue script e runbook contro infrastruttura AWS e sistemi
interni (SEND, Watchtower), ma non è un servizio rivolto al cittadino. Per
questo motivo non rientra nello scope ufficiale del programma di responsible
disclosure di pagoPA, che copre i prodotti pubblici (es. app IO, SEND).

## Segnalare una vulnerabilità

Se individui una vulnerabilità di sicurezza in questo repository (credenziali
esposte, privilege escalation in uno script, un bypass dei controlli di
sicurezza del CI, o altro), scrivi a **security@pagopa.it** descrivendo:

- il componente interessato (script, package, Lambda, workflow CI);
- i passi per riprodurre il problema;
- l'impatto potenziale.

Evita di aprire una issue pubblica per vulnerabilità non ancora corrette.

## Cosa aspettarsi

Non essendo un prodotto in scope del programma di bug bounty pagoPA, non è
previsto un processo formale di triage/reward. Le segnalazioni vengono
comunque prese in carico dal team che mantiene il repository (vedi
`CODEOWNERS`).
