# Failure-recovery matrix

| Failure | Expected state | Retry? | Recovery | Test |
|---|---|---|---|---|
| Email provider outage | Academic commit remains | Yes if retryable | `notifications.deliver` | notifications unit classify + fanout |
| WhatsApp outage / timeout | Academic commit remains; channel retryable | Yes | worker + timeout category | whatsapp-provider timeout; notifications tests |
| PDF generation failure | Application stays submitted; pdfStatus failed/pending | Yes | regenerate job | ca-recovery PDF tests |
| Scanner unavailable | File not SAFE / not downloadable | Yes | rescan job | auth-boundary scanner; learning tests |
| Calendar sync failure | CA schedule authoritative if persisted | Yes | integrity diagnostic | integrity + schedule rollback on insert fail |
| Worker crash after enqueue | In-memory queue **lost** (known limitation) | n/a durable | restart loses jobs | documented; drain tests for in-process |
| Redis interruption | Rate limiter may fall back to memory; jobs still in-memory | Maybe | reconnect | production-checklist; not load-tested |
| Duplicate notification event | One inbox row | n/a | unique idempotencyKey | concurrency.test.js |
| Duplicate CA draft | One active application | n/a | unique partial index | concurrency.test.js |
