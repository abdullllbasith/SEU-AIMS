import { generateKeyPairSync } from 'node:crypto';

/** P-256 key pair in the same JWK shape the browser Study Room uses. */
export function generateIdentityJwk() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const exported = privateKey.export({ format: 'jwk' });
  return {
    publicKeyJwk: {
      kty: 'EC',
      crv: 'P-256',
      x: exported.x,
      y: exported.y,
    },
    privateKeyJwk: {
      kty: 'EC',
      crv: 'P-256',
      x: exported.x,
      y: exported.y,
      d: exported.d,
    },
  };
}
