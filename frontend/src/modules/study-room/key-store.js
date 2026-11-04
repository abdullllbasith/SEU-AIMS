const DB_NAME = 'seu-aims-study-room';
const STORE = 'identity';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Identity keys are stored per signed-in user. A browser shared by several accounts must never
// hand one student's private key to another, or old messages stop decrypting.
function identityKey(userId) {
  return userId ? `identity:${userId}` : 'identity';
}

function rawSignature(bytes) {
  return Array.from(bytes).join(',');
}

export async function loadRoomKeyMaterial(conversationId) {
  try {
    const db = await openDb();
    const stored = await idbGet(db, `room:${conversationId}`);
    return Array.isArray(stored?.rawKeys) ? stored.rawKeys.map((item) => new Uint8Array(item)) : [];
  } catch {
    return [];
  }
}

export async function rememberRoomKeyMaterial(conversationId, rawKeys) {
  const unique = [];
  const seen = new Set();
  for (const raw of rawKeys) {
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const signature = rawSignature(bytes);
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    unique.push(bytes);
  }
  if (!unique.length) {
    return;
  }
  try {
    const db = await openDb();
    await idbPut(db, `room:${conversationId}`, { rawKeys: unique });
  } catch {
    // The chat still works for this visit if local key storage is unavailable.
  }
}

export async function readStoredIdentity(importPrivateJwk, userId, { legacy = false } = {}) {
  try {
    const db = await openDb();
    const stored = await idbGet(db, legacy ? 'identity' : identityKey(userId));
    if (!stored?.privateJwk || !stored?.publicJwk) {
      return null;
    }
    const privateKey = await importPrivateJwk(stored.privateJwk);
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      stored.publicJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
    return { privateKey, publicKey, publicJwk: stored.publicJwk, keyVersion: stored.keyVersion || '1' };
  } catch {
    return null;
  }
}

export async function persistIdentity(record, importPrivateJwk, userId) {
  const publicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: record.publicKeyJwk.x,
    y: record.publicKeyJwk.y,
  };
  const privateKey = await importPrivateJwk(record.privateKeyJwk);
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
  try {
    const db = await openDb();
    await idbPut(db, identityKey(userId), {
      privateJwk: record.privateKeyJwk,
      publicJwk,
      keyVersion: record.keyVersion || '1',
    });
  } catch {
    // This browser can still use the key for the current visit.
  }
  return { privateKey, publicKey, publicJwk, keyVersion: record.keyVersion || '1' };
}

export async function loadOrCreateIdentity(generateIdentityKeyPair, exportPrivateJwk, importPrivateJwk, exportPublicJwk, userId) {
  try {
    const db = await openDb();
    const stored = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(identityKey(userId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (stored?.privateJwk) {
      const privateKey = await importPrivateJwk(stored.privateJwk);
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        stored.publicJwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        [],
      );
      return { privateKey, publicKey, publicJwk: stored.publicJwk, keyVersion: stored.keyVersion || '1' };
    }
    const pair = await generateIdentityKeyPair();
    const publicJwk = await exportPublicJwk(pair.publicKey);
    const privateJwk = await exportPrivateJwk(pair.privateKey);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ privateJwk, publicJwk, keyVersion: '1' }, identityKey(userId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return { ...pair, publicJwk, keyVersion: '1' };
  } catch {
    const pair = await generateIdentityKeyPair();
    const publicJwk = await exportPublicJwk(pair.publicKey);
    return { ...pair, publicJwk, keyVersion: '1', ephemeral: true };
  }
}
