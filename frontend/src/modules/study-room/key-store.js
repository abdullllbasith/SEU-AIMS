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

export async function loadOrCreateIdentity(generateIdentityKeyPair, exportPrivateJwk, importPrivateJwk, exportPublicJwk) {
  try {
    const db = await openDb();
    const stored = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get('identity');
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
      tx.objectStore(STORE).put({ privateJwk, publicJwk, keyVersion: '1' }, 'identity');
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
