# Chennai One — SVP QR Generator

A web application that generates **Store Value Pass (SVP) QR codes** for Chennai Metro Rail (CMRL) in compliance with the **CDAC QR Ticketing Specification v1.0**.

Live app: [https://svp-qr-generator.web.app](https://svp-qr-generator.web.app)

---

## Overview

### What it does
- Generates dynamic, time-refreshing SVP QR codes per the CDAC spec (Part I + Part II)
- Supports **Scheme 0x03** (RSA-2048 / SHA-256, plain ticket data) and **Scheme 0x04** (AES-256-ECB ticket encryption + RSA-2048 signing)
- Signing and encryption are performed server-side — private key and AES key never touch the browser
- Keys live in **Google Cloud Secret Manager**
- RSA key pair **rotates automatically every day at midnight UTC**
- Built-in **QR Signature Verifier** — generate signature from components and compare against original QR

### SVP journey model
Source and destination encoded as `FF` (open journey, CMRL operator-specific code 255). Fare is `0` at generation — deducted by AFC at exit based on actual journey. Balance carried in Op-specific Ticket Data (4 bytes).

---

## Architecture

```
Browser (Firebase Hosting)
  │
  ├── POST /api/signQR      → Cloud Function: signQR
  │                              └── Scheme 0x03: RSA-sign plaintext
  │                              └── Scheme 0x04: AES-256-ECB encrypt ticket fields, then RSA-sign
  │                              └── Returns { signature, signableStr }
  │
  ├── GET  /api/public-key  → Cloud Function: getPublicKey
  │                              └── Returns current RSA public key as PEM
  │
  └── GET  /api/aes-key     → Cloud Function: getAesKey
                                   └── Returns AES-256 key as hex (AFC validator setup only)

Secret Manager
  ├── RSA_PRIVATE_KEY        ← rotated daily by rotateKeys Cloud Scheduler function
  └── AES_TICKET_KEY         ← 32-byte AES-256 key (64-char hex), set once
```

---

## QR Payload Structure (SQDSR)

```
#<QR_Signature>#<QR_SVC>#<QR_Tkt_Block>#<QR_Dynamic_Data>#
```

**Signing scope:** `QR_SVC#QR_Tkt_Block` only — dynamic data is unsigned and refreshed locally by the APP.

| TAG | Label | Size | Key Fields |
|-----|-------|------|------------|
| 0x81 | QR Security | 1 B | Scheme: `3` (0x03) or `4` (0x04) |
| 0x82 | Dataset Version | 1 B | v1.0 = `4` |
| 0x83 | Common Data | 62 B | TG ID, Serial No, TXN Ref, Mobile |
| 0x84 | Dynamic Data | 32 B | Updated Time only — status/location empty per spec Table 5.14 |
| 0x85 | Ticket Block | 28 B | Product SVP (`69` = 105), Station `FF`, Validity 480 min |
| — | Signature | ~344 B | RSA-2048 Base64, prepended before QR_SVC |

### Scheme 0x03 — Ticket Block (plain)
```
{(<87|1|10|[1|FF|FF|actDt|69|1|fare|1E0|B4|opTktData]>)}
```

### Scheme 0x04 — Ticket Block (AES-256-ECB encrypted)
```
{(<87|1|11|Base64AESencrypted>)}
```
The ticket fields inside `[...]` are AES-256-ECB encrypted (PKCS7 padded) and Base64-encoded. OpID, NoTkts, and ValInfo remain plaintext so validators can locate their operator's block.

### Dynamic Data
```
{timestamp||||}
```
Only QR Updated Time carries a value. Status, lat, lon, and op-specific dynamic fields are empty per spec Table 5.14.

### Hex encoding
All numeric SQDSR fields use **no leading zeros** (e.g. `87` not `0087`, `FF` not `00FF`, `1` not `01`). Fixed-width byte-concatenation fields (Serial No, Op-specific Ticket Data) remain full-width.

---

## Project Structure

```
svp/
├── src/
│   ├── App.jsx                  # Main app — generate + auto-refresh QR
│   ├── components/
│   │   ├── SVPForm.jsx          # Input form (balance, mobile, TXN ref, scheme selector)
│   │   ├── QRDisplay.jsx        # QR canvas + journey info card + countdown ring
│   │   ├── QRVerifier.jsx       # Signature verifier — generate & compare, or full QR paste
│   │   └── PayloadBreakdown.jsx # Spec compliance checker UI (PASS/FAIL/WARN)
│   ├── lib/
│   │   ├── dataset.js           # Builds TAG 81–85 dataset per spec
│   │   ├── sqdsr.js             # Serialises dataset to SQDSR string
│   │   ├── crypto.js            # sign() → /api/signQR; verify() → browser WebCrypto
│   │   ├── parser.js            # Parses raw QR string back to dataset shape
│   │   └── validator.js         # Spec compliance checks (PASS/FAIL/WARN)
│   └── constants/
│       ├── spec.js              # CDAC spec constants (tags, schemes, defaults)
│       └── stations.js          # CMRL operator constants (TG_ID, OPERATOR_ID, PRODUCT_SVP)
├── functions/
│   ├── index.js                 # Cloud Functions: signQR, getPublicKey, getAesKey, rotateKeys
│   └── package.json
├── scripts/
│   ├── generate-keys.js         # One-time RSA key pair generator
│   └── setup-aes-key.js         # One-time AES-256 key generator → stores in Secret Manager
├── public/
│   └── public-key.pem           # Current RSA public key (for validators)
├── firebase.json                # Hosting rewrites + functions config
└── vite.config.js               # Dev proxy → Firebase emulator
```

---

## First-Time Setup

### Prerequisites
- Node.js 22+
- Firebase CLI: `npm install -g firebase-tools`
- Firebase project on **Blaze (pay-as-you-go)** plan
- `gcloud` CLI authenticated: `gcloud auth login`

### 1. Install dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### 2. Generate RSA key pair (once)

```bash
node scripts/generate-keys.js
```

Creates:
- `private-key.pem` — **never commit**, upload to Secret Manager (step 3)
- `public/public-key.pem` — committed, hosted at `/public-key.pem`

### 3. Upload RSA private key to Secret Manager

```bash
firebase functions:secrets:set RSA_PRIVATE_KEY < private-key.pem
```

### 4. Generate and store AES-256 key (Scheme 0x04)

```bash
# Create the secret first (once)
gcloud secrets create AES_TICKET_KEY --replication-policy=automatic --project=svp-qr-generator

# Generate key and store it
node scripts/setup-aes-key.js
```

Share the printed hex key securely with the CMRL AFC validator team — they need it to decrypt Scheme 0x04 ticket blocks.

### 5. Grant IAM roles

In [Google Cloud IAM Console](https://console.cloud.google.com/iam-admin/iam), find the service account `PROJECT_NUMBER-compute@developer.gserviceaccount.com` and add:
- `Secret Manager Secret Accessor`
- `Secret Manager Secret Version Adder`

### 6. Deploy

```bash
npm run build
firebase deploy
```

---

## Local Development

### Step 1 — Create local secrets file

```
functions/.secret.local
```
```
RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
AES_TICKET_KEY="<64-char hex key>"
```

### Step 2 — Terminal 1: start Functions emulator

```bash
cd functions
npx firebase emulators:start --only functions
```

### Step 3 — Terminal 2: start Vite

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api/*` to the local emulator.

---

## API Endpoints

### `POST /api/signQR`

**Request**
```json
{ "plaintext": "QR_SVC#QR_Tkt_Block", "scheme": 3 }
```
`scheme` is optional, defaults to `3`. Pass `4` for AES-256-ECB encryption before signing.

**Response**
```json
{ "signature": "<Base64>", "signableStr": "QR_SVC#QR_Tkt_Block_possibly_encrypted" }
```
For scheme 3, `signableStr === plaintext`. For scheme 4, `signableStr` has the ticket fields replaced with Base64 AES ciphertext.

---

### `GET /api/public-key`
Returns current RSA public key as PEM. Share with validator team — fetch daily (key rotates at midnight UTC).

---

### `GET /api/aes-key`
Returns AES-256 key as hex. **For one-time AFC validator setup only** — restrict access in production.

---

## For Validators

### RSA public key (Schemes 0x03 and 0x04)
```
https://svp-qr-generator.web.app/api/public-key
```
Fetch daily — key rotates at **midnight UTC**.

**Verify signed scope:** `QR_SVC#QR_Tkt_Block` (everything between the 2nd and 4th `#` in the payload).

**OpenSSL example:**
```bash
curl https://svp-qr-generator.web.app/api/public-key > public-key.pem
echo -n "QR_SVC#QR_Tkt_Block" | openssl dgst -sha256 -verify public-key.pem \
  -signature <(echo "<base64-sig>" | base64 -d)
```

### AES key (Scheme 0x04 only)
Shared out-of-band (hex string). Algorithm: `AES-256-ECB`, encoding: hex.

Decryption steps:
1. Extract Base64 content from `{(<opId|noTkts|valInfo|**Base64**>)}`
2. Base64-decode → ciphertext bytes
3. AES-256-ECB decrypt with shared key → PKCS7-unpad → UTF-8 ticket fields string
4. Parse `field1|field2|...|field10` per spec Table 5.11

---

## Key Rotation

| What | Detail |
|------|--------|
| Schedule | Daily at 00:00 UTC (`rotateKeys` Cloud Function) |
| Old versions | Retained in Secret Manager for audit |
| Propagation | New key active within 1 hour (in-memory cache TTL) |
| Validator action | Fetch `/api/public-key` daily |

Manual rotation:
```bash
firebase functions:shell
# inside shell:
rotateKeys()
```

---

## Security Notes

- RSA **private key never leaves Google Cloud** — generated, stored, and used within Secret Manager + Cloud Functions only
- AES key is **operator-specific** — shared once with CMRL AFC team, never exposed in the QR
- QR **refreshes every 30 seconds** (TAG 84 QR Updated Time) to prevent replay attacks
- Scheme 0x03: integrity + authenticity (RSA signature), ticket data readable
- Scheme 0x04: adds confidentiality (AES-256-ECB encryption) — AFC validators need the shared AES key to read ticket fields
