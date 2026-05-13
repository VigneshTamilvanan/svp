/**
 * One-time AES-256 key generator for SVP QR Scheme 0x04 (SecureQR-Alpha).
 *
 * Run once:  node scripts/setup-aes-key.js
 *
 * Requires gcloud CLI authenticated:  gcloud auth login
 * Secret must exist first:
 *   gcloud secrets create AES_TICKET_KEY --replication-policy=automatic --project=svp-qr-generator
 */

import { randomBytes } from 'crypto'
import { execSync }    from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir }      from 'os'
import { join }        from 'path'

const PROJECT_ID = 'svp-qr-generator'
const SECRET_ID  = 'AES_TICKET_KEY'

const aesKeyHex = randomBytes(32).toString('hex')   // 64-char hex = 32 bytes

console.log('\nGenerated AES-256 key (hex):')
console.log(`  ${aesKeyHex}`)
console.log('\nStoring in Secret Manager via gcloud...')

// Write key to a temp file, pipe into gcloud, then delete
const tmp = join(tmpdir(), `aes-key-${Date.now()}.txt`)
try {
  writeFileSync(tmp, aesKeyHex, { mode: 0o600 })
  execSync(
    `gcloud secrets versions add ${SECRET_ID} --data-file="${tmp}" --project=${PROJECT_ID}`,
    { stdio: 'inherit' }
  )
} finally {
  unlinkSync(tmp)
}

console.log(`\nStored as ${SECRET_ID}/versions/latest in project ${PROJECT_ID}`)
console.log('\nShare this key securely with the CMRL AFC validator team.')
console.log('They need it to decrypt Scheme 0x04 ticket blocks at tap-in gates.\n')
