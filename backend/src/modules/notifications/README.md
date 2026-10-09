# notifications

**Owns:** In-app inbox, channel fan-out, preferences, templates (interpolation only), delivery attempts, retries, admin delivery counts.

**Must not own:** Academic facts, CA workflow, official results, Meta request construction details outside the infrastructure adapter, recipient lists from the client.

Source modules call `fanoutNotification`. Email/WhatsApp are queued; API acceptance is `SENT`, not `DELIVERED`. Noop/unconfigured providers fail closed without retry.

Mandatory types cannot be disabled. Optional types honour email/WhatsApp preference flags through `channelsForNotification`. In-app remains on for mandatory events. Quiet hours are not applied; no rule defines which messages may be delayed.
