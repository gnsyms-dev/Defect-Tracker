/**
 * Generates a v4 UUID, working in insecure contexts.
 *
 * THE TRAP THIS SOLVES: `crypto.randomUUID()` requires a SECURE CONTEXT. `localhost`
 * and `https://` qualify; `http://192.168.1.x:5173` does NOT -- and that is exactly
 * the URL you use when testing on a real phone against a dev machine. So the
 * function that generates the offline idempotency key would be `undefined` on the
 * one device you most need to test.
 *
 * `crypto.getRandomValues` is NOT secure-context-gated, so tier 2 is what actually
 * runs on a LAN IP.
 *
 * (Related, and worth knowing: a service worker also requires a secure context, so
 * PWA/offline-shell testing over a plain-http LAN IP silently registers nothing.
 * `adb reverse tcp:5173 tcp:5173` makes an Android phone see it as localhost.)
 */
export function newClientUuid(): string {
  const cryptoObj: Crypto | undefined = globalThis.crypto;

  if (typeof cryptoObj?.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }

  if (typeof cryptoObj?.getRandomValues === 'function') {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(16));
    // Set the version (4) and variant (RFC 4122) bits.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return formatUuid(bytes);
  }

  // Unreachable on any browser from the last decade, but kept because a shop-floor
  // tool must never refuse to record a defect. Still UUID-shaped, because the server
  // validates the field with @IsUUID('4').
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function formatUuid(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
