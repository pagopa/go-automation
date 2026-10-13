# go-send

SDK per SEND (Sistema di Notificazione Digitale): crea e gestisce
notifiche digitali/analogiche, timeline e attachment via API SEND e
DynamoDB.

## Responsabilità

- **`SENDNotifications`** — classe SDK principale, espone `notifications`
  (`SENDNotificationService`) e `attachment` (`SENDAttachmentService`)
  sopra un `GOHttpClient` condiviso.
- **`services/`** — `SENDNotificationService`, `SENDAttachmentService`,
  `SENDTimelineService` (query timeline via DynamoDB).
- **`builders/`** — `SENDNotificationBuilder`, `SENDF24MetadataBuilder`,
  `SENDPagoPaPaymentBuilder`, per comporre payload di notifica complessi.
- **`workers/`** — worker batch: import notifiche da CSV
  (`SENDNotificationImportWorker`, con adapter per formato standard e QA
  test) e upload massivo di attachment verso SafeStorage
  (`SENDAttachmentUploadWorker`).

Consumato da `send-fetch-timeline-from-iun`, `send-import-notifications`
e `send-upload-attachments`.

## Esempio

```typescript
import { SENDNotifications } from '@go-automation/go-send';

const send = new SENDNotifications({ basePath, apiKey });
const builder = send.createNotificationBuilder();
await send.notifications.sendNotification(builder.build());
```

## Test e build

```bash
pnpm --filter=@go-automation/go-send test
pnpm --filter=@go-automation/go-send build
```
