# study-room

**Owns:** Student-only Study Room, batch common chat, private chat, E2E ciphertext persistence, student shared folders/files, reporting, and department-admin file moderation.

**Must not own:** Lecturer participation, official course resources, chat plaintext, or an admin chat-reading capability. Socket.IO *transport* lives in `infrastructure/realtime`; this module attaches authorization and events.

## Authorization

Ordinary Study Room APIs and sockets require `STUDENT` plus an active academic context. Scope is the student's current department + batch. Lecturers are denied. Department administrators are denied on student routes; they may use `/api/study-room/moderation/*` for shared-file review only.

## E2E protocol (`webcrypto-ecdh-aesgcm-v1`)

- Identity: ECDH P-256 key pair generated in the browser. Private keys stay in IndexedDB. Only the public JWK is stored on the server.
- Private chat: both parties derive an AES-256-GCM conversation key via ECDH + HKDF. The server never holds that key.
- Common (batch) chat: a client-generated group AES key is wrapped per member (`ConversationKeyEnvelope`). The server stores wrap ciphertext only.
- Messages persist `encryptedPayload.ciphertext/nonce/keyVersion/protocolVersion` only. There is no plaintext body field.

### Threat model and limitations

- This is **not** Signal/WhatsApp. There is no deniable double-ratchet, sealed sender, or automatic group-key rotation on membership change.
- Students who keep a former group key locally can decrypt later common-room messages until rotation is implemented.
- Public-key directory is TOFU: a compromised API could substitute a public key on first fetch. Clients should treat key changes as suspicious.
- IndexedDB key loss (new browser/device, cleared site data) makes old ciphertext unreadable. There is **no** server-side private-key escrow.
- Chat file attachments are **not** implemented as E2E blobs. Shared-folder files are scanned; a message may reference an already-available shared resource id only.

Student blocking is not implemented. No approved rule defines who may block whom.

`GET /api/study-room/moderation/reconciliation` reports shared files marked available when the stored file is missing or not safe, and open reports whose target resource is already removed. It does not remove files, close reports, or return message contents.

## Shared files (Option B)

Uploads use the files module (allowlist, magic bytes, opaque keys `study-room/{folderId}/{uuid}`, malware scan). Default department mode is `ADMIN_REVIEW`. `NON_REVIEW` still requires `scanStatus=SAFE` before `AVAILABLE`. Scan failure/unconfigured scanner fails closed (not downloadable).

## Socket events

`study-room:join`, `study-room:leave`, `study-room:message`, `study-room:typing`, `study-room:message:new`. Handshake uses the same HttpOnly access cookie as REST. Room names are not proof of membership.

## Scaling

API instances are stateless for Mongo persistence. With Redis connected, Socket.IO uses `@socket.io/redis-adapter`. That path is **not** load-tested across multiple API processes. Message durability is Mongo, not which instance accepted the POST.
