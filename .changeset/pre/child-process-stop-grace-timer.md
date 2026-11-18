---
'@pagopa/go-common': patch
---

`GOChildProcess.stop()`: il timer di attesa prima del `SIGKILL` viene annullato appena il processo termina, quindi non tiene più vivo il chiamante fino a 5 secondi dopo l'arresto.
