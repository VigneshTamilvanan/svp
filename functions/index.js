/**
 * SVP QR — Cloud Functions
 *
 * signQR       POST /api/signQR       — signs SQDSR plaintext with current RSA private key
 *                                       Scheme 0x03: plain RSA sign
 *                                       Scheme 0x04: AES-256-ECB encrypt ticket block, then RSA sign
 * getPublicKey GET  /api/public-key   — returns current RSA public key as PEM (for validators)
 * getAesKey    GET  /api/aes-key      — returns AES-256 key as hex (for AFC validator setup only)
 * rotateKeys   Scheduled (daily)      — generates a new RSA-2048 key pair, updates Secret Manager
 */

import { onRequest }  from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import {
  createSign, createPublicKey, generateKeyPairSync,
  createCipheriv, randomBytes,
} from 'crypto'

const PROJECT_ID      = 'svp-qr-generator'
const SECRET_RSA      = 'RSA_PRIVATE_KEY'
const SECRET_AES      = 'AES_TICKET_KEY'   // 32-byte key stored as 64-char hex
const REGION          = 'us-central1'
const CACHE_TTL_MS    = 60 * 60 * 1000     // 1 hour

const secretClient = new SecretManagerServiceClient()

// ── Secret cache ──────────────────────────────────────────────────────────────
const rsaCache = { value: null, fetchedAt: 0 }
const aesCache = { value: null, fetchedAt: 0 }

async function getSecret(secretName, cache) {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    const val = process.env[secretName]
    if (!val) throw new Error(`Secret ${secretName} not found in functions/.secret.local`)
    return val.replace(/\\n/g, '\n')
  }
  const now = Date.now()
  if (cache.value && (now - cache.fetchedAt) < CACHE_TTL_MS) return cache.value
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`,
  })
  cache.value     = version.payload.data.toString('utf8').trim()
  cache.fetchedAt = now
  return cache.value
}

// ── AES-256-ECB ticket encryption ─────────────────────────────────────────────
// Encrypts the ticket hex fields string (content of [...]) with AES-256-ECB.
// Input is UTF-8 padded to a multiple of 16 bytes (PKCS7).
// Output is Base64 encoded — ready to embed as <Base64> in the ticket block.

function aesEncryptTicket(ticketHex, aesKeyHex) {
  const key    = Buffer.from(aesKeyHex, 'hex')   // 32 bytes
  const data   = Buffer.from(ticketHex, 'utf8')
  // PKCS7 pad to 16-byte boundary
  const padLen = 16 - (data.length % 16)
  const padded = Buffer.concat([data, Buffer.alloc(padLen, padLen)])
  const cipher = createCipheriv('aes-256-ecb', key, null)
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64')
}

// Replace [ticket_fields] with Base64AESencrypted in the signable string
// No inner <> — the outer {(<opId|noTkts|valInfo|Base64>)} provides the delimiters
function buildScheme04Payload(plaintext, aesKeyHex) {
  return plaintext.replace(/\[([^\]]+)\]/, (_, ticketHex) => {
    return aesEncryptTicket(ticketHex, aesKeyHex)
  })
}

// ── POST /api/signQR ──────────────────────────────────────────────────────────
export const signQR = onRequest(
  { region: REGION, cors: true, maxInstances: 10 },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return }

    const { plaintext, scheme } = req.body ?? {}
    if (!plaintext || typeof plaintext !== 'string') {
      res.status(400).json({ error: '`plaintext` string is required' })
      return
    }

    try {
      const privateKeyPem = await getSecret(SECRET_RSA, rsaCache)
      let signableStr = plaintext

      if (scheme === 4) {
        const aesKeyHex = await getSecret(SECRET_AES, aesCache)
        signableStr = buildScheme04Payload(plaintext, aesKeyHex)
      }

      const signer = createSign('SHA256')
      signer.update(signableStr, 'utf8')
      const signature = signer.sign(privateKeyPem, 'base64')

      res.json({ signature, signableStr })
    } catch (err) {
      console.error('signQR error:', err)
      res.status(500).json({ error: 'Signing failed' })
    }
  }
)

// ── GET /api/public-key ───────────────────────────────────────────────────────
export const getPublicKey = onRequest(
  { region: REGION, cors: false, maxInstances: 5 },
  async (req, res) => {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method Not Allowed' }); return }
    try {
      const privateKeyPem = await getSecret(SECRET_RSA, rsaCache)
      const publicKeyPem  = createPublicKey(privateKeyPem)
                              .export({ type: 'spki', format: 'pem' })
                              .toString()
      res.set('Content-Type', 'application/x-pem-file')
      res.set('Content-Disposition', 'inline; filename="public-key.pem"')
      res.set('Cache-Control', 'no-store')
      res.send(publicKeyPem)
    } catch (err) {
      console.error('getPublicKey error:', err)
      res.status(500).json({ error: 'Failed to export public key' })
    }
  }
)

// ── GET /api/aes-key ──────────────────────────────────────────────────────────
// Returns the AES-256 key as a hex string.
// Intended ONLY for one-time AFC validator setup — restrict access in production.
export const getAesKey = onRequest(
  { region: REGION, cors: false, maxInstances: 2 },
  async (req, res) => {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method Not Allowed' }); return }
    try {
      const aesKeyHex = await getSecret(SECRET_AES, aesCache)
      res.json({ aesKey: aesKeyHex, algorithm: 'AES-256-ECB', encoding: 'hex' })
    } catch (err) {
      console.error('getAesKey error:', err)
      res.status(500).json({ error: 'Failed to retrieve AES key' })
    }
  }
)

// ── Daily RSA key rotation ────────────────────────────────────────────────────
export const rotateKeys = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'UTC', region: REGION },
  async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength:      2048,
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    await secretClient.addSecretVersion({
      parent:  `projects/${PROJECT_ID}/secrets/${SECRET_RSA}`,
      payload: { data: Buffer.from(privateKey) },
    })
    rsaCache.value = null; rsaCache.fetchedAt = 0
    console.log(`RSA key rotated at ${new Date().toISOString()}`)
  }
)
