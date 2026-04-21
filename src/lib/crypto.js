/**
 * SecureQR Crypto — Part II §5, Security Scheme 0x03
 *
 * Scheme 0x03: RSA-based security
 *   - RSA-2048 key pair (RSASSA-PKCS1-v1_5 / SHA-256)
 *   - Signing is performed server-side by the /api/signQR Cloud Function
 *   - The private key lives in Google Cloud Secret Manager — never in the browser
 *   - The public key is fetched live from /api/public-key (rotates daily)
 */

// ── Signing (server-side) ─────────────────────────────────────────────────────

/**
 * Sign an SQDSR plaintext string via the Cloud Function.
 * The private key never leaves the server.
 * @param {string} plaintext
 * @returns {Promise<string>} Base64 RSA-2048 signature
 */
export async function sign(plaintext) {
  const res = await fetch('/api/signQR', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ plaintext }),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`Signing failed (${res.status}): ${msg}`)
  }
  const { signature } = await res.json()
  return signature
}

// ── Public key (fetched live from /api/public-key, cached per session) ────────
// The key rotates daily. The cache is intentionally short-lived (page session only)
// so refreshing the page always picks up the current key.

let _publicKey = null

/** Force the next verify() call to re-fetch the public key from /api/public-key. */
export function clearPublicKeyCache() {
  _publicKey = null
}

async function getPublicKey() {
  if (_publicKey) return _publicKey

  const pem = await fetch('/api/public-key').then(r => {
    if (!r.ok) throw new Error(`Could not load public key (${r.status})`)
    return r.text()
  })

  // Strip PEM headers and decode Base64 DER
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const der  = Uint8Array.from(atob(b64), c => c.charCodeAt(0))

  _publicKey = await crypto.subtle.importKey(
    'spki',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['verify']
  )
  return _publicKey
}

// ── Verification (browser-side, uses current public key) ──────────────────────

/**
 * Verify a Base64 signature against an SQDSR plaintext using the current public key.
 * @param {string} plaintext
 * @param {string} signatureB64
 * @returns {Promise<boolean>}
 */
export async function verify(plaintext, signatureB64) {
  const publicKey = await getPublicKey()
  const data = new TextEncoder().encode(plaintext)
  const sig  = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0))
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, sig, data)
}

/**
 * Export the current public key as a Base64 DER string (for display in the UI).
 * @returns {Promise<string>}
 */
export async function exportPublicKeyB64() {
  const publicKey = await getPublicKey()
  const der = await crypto.subtle.exportKey('spki', publicKey)
  return btoa(String.fromCharCode(...new Uint8Array(der)))
}
