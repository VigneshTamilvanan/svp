/**
 * SecureQR Crypto — Part II §5, Security Scheme 0x03
 *
 * Scheme 0x03: RSA-based security
 *   - RSA-2048 key pair (RSASSA-PKCS1-v1_5)
 *   - SHA-256 hashing
 *   - Digital signature over the full SQDSR plaintext
 *   - Base64 encoded signature appended to payload
 *   - No encryption (confidentiality not provided — Scheme 0x03 is Medium-high)
 *
 * In production (Scheme 0x04 SecureQR-Alpha):
 *   - TG holds the RSA private key (certified by a Root CA)
 *   - Validators hold the TG public key certificate
 *   - Operator AES secret key encrypts the Ticket Block
 */

let _keyPair = null

/**
 * Generate (or return cached) RSA-2048 key pair.
 * In a real TG this would be loaded from a hardware HSM / Key Management System.
 */
export async function getKeyPair() {
  if (!_keyPair) {
    _keyPair = await crypto.subtle.generateKey(
      {
        name:           'RSASSA-PKCS1-v1_5',
        modulusLength:  2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
        hash:           'SHA-256',
      },
      true,            // extractable — needed to export public key for display
      ['sign', 'verify']
    )
  }
  return _keyPair
}

/**
 * Sign an SQDSR plaintext string with the TG private key.
 * Returns a Base64-encoded RSA signature (~172 chars after Base64).
 * @param {string} plaintext
 * @returns {Promise<string>} Base64 signature
 */
export async function sign(plaintext) {
  const { privateKey } = await getKeyPair()
  const data      = new TextEncoder().encode(plaintext)
  const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, data)
  return btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
}

/**
 * Verify a Base64 signature against an SQDSR plaintext using the TG public key.
 * @param {string} plaintext
 * @param {string} signatureB64
 * @returns {Promise<boolean>}
 */
export async function verify(plaintext, signatureB64) {
  const { publicKey } = await getKeyPair()
  const data = new TextEncoder().encode(plaintext)
  const sig  = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0))
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, sig, data)
}

/**
 * Export the public key as a Base64 DER string (for display / propagation to validators).
 * @returns {Promise<string>}
 */
export async function exportPublicKeyB64() {
  const { publicKey } = await getKeyPair()
  const der = await crypto.subtle.exportKey('spki', publicKey)
  return btoa(String.fromCharCode(...new Uint8Array(der)))
}
