# Trust boundaries

```text
Browser
  → Reverse proxy / TLS terminator (production)
    → API (Express)
      → Domain services
        → MongoDB / Redis / object storage
        → Workers
          → Email / WhatsApp / malware scanner
```

Study Room realtime:

```text
Student device → Socket.IO (cookie session) → conversation authorization → encrypted payload store
```

Every boundary is untrusted until authenticated and authorized. The React UI is not a security control.
