/**
 * SVP QR — Cloud Functions
 *
 * signQR       POST /api/signQR       — signs SQDSR plaintext with current RSA private key
 * getPublicKey GET  /api/public-key   — returns current RSA public key as PEM (for validators)
 * rotateKeys   Scheduled (daily)      — generates a new RSA-2048 key pair, updates Secret Manager
 */

import { onRequest }  from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { createSign, createPublicKey, generateKeyPairSync } from 'crypto'

const PROJECT_ID  = 'svp-qr-generator'
const SECRET_NAME = 'RSA_PRIVATE_KEY'
const REGION      = 'us-central1'

const secretClient = new SecretManagerServiceClient()

// ── In-memory cache (1-hour TTL) ─────────────────────────────────────────────
// Avoids a Secret Manager round-trip on every request.
// Automatically expires so rotated keys are picked up within the hour.
const cache = { value: null, fetchedAt: 0 }
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

async function getPrivateKeyPem() {
  // Local emulator: secrets come from functions/.secret.local as env vars
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    const val = process.env[SECRET_NAME]
    if (!val) throw new Error(`Secret ${SECRET_NAME} not found in functions/.secret.local`)
    return val.replace(/\\n/g, '\n') // unescape newlines if stored as \n
  }

  const now = Date.now()
  if (cache.value && (now - cache.fetchedAt) < CACHE_TTL_MS) return cache.value

  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/${SECRET_NAME}/versions/latest`,
  })
  cache.value     = version.payload.data.toString('utf8')
  cache.fetchedAt = now
  return cache.value
}

// ── POST /api/signQR ──────────────────────────────────────────────────────────
export const signQR = onRequest(
  { region: REGION, cors: true, maxInstances: 10 },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return }

    const { plaintext } = req.body ?? {}
    if (!plaintext || typeof plaintext !== 'string') {
      res.status(400).json({ error: '`plaintext` string is required' })
      return
    }

    try {
      const privateKeyPem = await getPrivateKeyPem()
      const signer = createSign('SHA256') // RSASSA-PKCS1-v1_5 + SHA-256
      signer.update(plaintext, 'utf8')
      res.json({ signature: signer.sign(privateKeyPem, 'base64') })
    } catch (err) {
      console.error('signQR error:', err)
      res.status(500).json({ error: 'Signing failed' })
    }
  }
)

// ── GET /api/public-key ───────────────────────────────────────────────────────
// Returns the RSA public key as a PEM string.
// Validators call this endpoint daily to stay in sync with key rotations.
// The public key is derived server-side from the current private key —
// only one secret needs managing.
export const getPublicKey = onRequest(
  { region: REGION, cors: false, maxInstances: 5 },
  async (req, res) => {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method Not Allowed' }); return }

    try {
      const privateKeyPem = await getPrivateKeyPem()
      const publicKeyPem  = createPublicKey(privateKeyPem)
                              .export({ type: 'spki', format: 'pem' })
                              .toString()

      res.set('Content-Type', 'application/x-pem-file')
      res.set('Content-Disposition', 'inline; filename="public-key.pem"')
      res.set('Cache-Control', 'no-store') // always serve the current key
      res.send(publicKeyPem)
    } catch (err) {
      console.error('getPublicKey error:', err)
      res.status(500).json({ error: 'Failed to export public key' })
    }
  }
)

// ── Daily key rotation (scheduled) ───────────────────────────────────────────
// Runs at midnight UTC every day.
// Adds a new secret version to Secret Manager (old versions are retained for audit).
// signQR and getPublicKey pick up the new key within CACHE_TTL_MS (1 hour).
export const rotateKeys = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'UTC', region: REGION },
  async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength:      2048,
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })

    await secretClient.addSecretVersion({
      parent:  `projects/${PROJECT_ID}/secrets/${SECRET_NAME}`,
      payload: { data: Buffer.from(privateKey) },
    })

    // Bust the in-memory cache so the next request fetches the new key
    cache.value     = null
    cache.fetchedAt = 0

    console.log(`RSA key rotated at ${new Date().toISOString()}`)
  }
)
