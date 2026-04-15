/**
 * One-time RSA-2048 key pair generator for SVP QR signing.
 *
 * Run once:  node scripts/generate-keys.js
 *
 * Outputs:
 *   private-key.pem          ← upload to Secret Manager, NEVER commit
 *   public/public-key.pem    ← committed + hosted at /public-key.pem for validators
 */

import { generateKeyPairSync } from 'crypto'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',   format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8',  format: 'pem' },
})

// Private key — store in Secret Manager, never commit
writeFileSync(join(root, 'private-key.pem'), privateKey, { mode: 0o600 })

// Public key — goes into Vite's public/ dir, served at /public-key.pem
mkdirSync(join(root, 'public'), { recursive: true })
writeFileSync(join(root, 'public', 'public-key.pem'), publicKey)

console.log('\nRSA-2048 key pair generated successfully.\n')
console.log('  private-key.pem          → upload to Secret Manager (see README)')
console.log('  public/public-key.pem    → share this URL with the validator team:\n')
console.log('  https://svp-qr-generator.web.app/public-key.pem\n')
console.log('  ⚠  Add private-key.pem to .gitignore — DO NOT commit it.\n')
