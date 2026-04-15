# Chennai One — SVP QR Generator

A web application that generates **Store Value Pass (SVP) QR codes** for Chennai Metro Rail (CMRL) in compliance with the **CDAC QR Ticketing Specification v1.0**.

Live app: [https://svp-qr-generator.web.app](https://svp-qr-generator.web.app)

---

## Overview

### What it does
- Generates dynamic, time-refreshing SVP QR codes per the CDAC spec
- QR payload is signed server-side using **RSA-2048 / SHA-256** (Scheme 0x03)
- The private key never touches the browser — it lives in **Google Cloud Secret Manager**
- The RSA key pair **rotates automatically every day at midnight UTC**
- Validators can fetch the current public key at any time via a stable API endpoint

### SVP journey model
Source and destination are encoded as `0x0000` (ANY) — the AFC gate at the station identifies entry/exit. Fare is `0x00000000` at generation time and deducted by the AFC system at exit based on the actual journey.

---

## Architecture

```
Browser (Firebase Hosting)
  │
  ├── POST /api/signQR      → Cloud Function: signQR
  │                              └── reads RSA private key from Secret Manager
  │                              └── returns Base64 RSA-2048 signature
  │
  └── GET  /api/public-key  → Cloud Function: getPublicKey
                                   └── derives public key from current private key
                                   └── returns PEM — share with validator team

Secret Manager
  └── RSA_PRIVATE_KEY        ← rotated daily by Cloud Scheduler → rotateKeys function
```

---

## QR Payload Structure (SQDSR)

```
{QR_SVC} | {QR_DYNAMIC_DATA} | {TICKET_BLOCK} | {SIG:<base64>}
```

| TAG | Label | Size | Key Fields |
|-----|-------|------|------------|
| 0x81 | QR Security | 1 B | Scheme 0x03 (RSA-2048 + SHA-256) |
| 0x82 | Dataset Version | 1 B | v1.0 = 0x04 |
| 0x83 | Common Data | 62 B | TG ID, Serial No, TXN Ref, Mobile |
| 0x84 | Dynamic Data | 32 B | Timestamp, SVP Balance, QR Status |
| 0x85 | Ticket Block | 28 B | Product SVP (0x0005), Validity 480 min |
| — | Signature | ~344 B | RSA-2048 Base64, appended as `{SIG:…}` |

---

## Project Structure

```
svp/
├── src/
│   ├── App.jsx                  # Main app — generate + auto-refresh QR
│   ├── components/
│   │   ├── SVPForm.jsx          # Input form (balance, mobile, TXN ref)
│   │   ├── QRDisplay.jsx        # QR canvas + journey info card
│   │   └── PayloadBreakdown.jsx # Spec compliance checker UI
│   ├── lib/
│   │   ├── dataset.js           # Builds TAG 81–85 dataset per spec
│   │   ├── sqdsr.js             # Serialises dataset to SQDSR string
│   │   ├── crypto.js            # Browser: calls /api/signQR + /api/public-key
│   │   └── validator.js         # Spec compliance checks (PASS/FAIL/WARN)
│   └── constants/
│       ├── spec.js              # CDAC spec constants (tags, schemes, defaults)
│       └── stations.js          # CMRL station codes
├── functions/
│   ├── index.js                 # Cloud Functions: signQR, getPublicKey, rotateKeys
│   └── package.json
├── scripts/
│   └── generate-keys.js         # One-time RSA key pair generator
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

### 1. Install dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### 2. Generate RSA key pair (once)

```bash
node scripts/generate-keys.js
```

This creates:
- `private-key.pem` — **never commit this**, upload to Secret Manager (step 3)
- `public/public-key.pem` — committed, hosted at `/public-key.pem`

### 3. Upload private key to Secret Manager

```bash
firebase functions:secrets:set RSA_PRIVATE_KEY < private-key.pem
```

### 4. Grant IAM roles

In [Google Cloud IAM Console](https://console.cloud.google.com/iam-admin/iam):

Find the service account `PROJECT_NUMBER-compute@developer.gserviceaccount.com` and add:
- `Secret Manager Secret Accessor`
- `Secret Manager Secret Version Adder`

Also enable **Cloud Functions** in [Cloud Build settings](https://console.cloud.google.com/cloud-build/settings).

### 5. Deploy

```bash
npm run build
firebase deploy
```

---

## Local Development

Run the Firebase Functions emulator and Vite dev server in parallel.

### Step 1 — Create local secrets file

```bash
cd functions
echo "RSA_PRIVATE_KEY=\"$(awk '{printf "%s\\n", $0}' ../private-key.pem)\"" > .secret.local
cd ..
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

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api/signQR` and `/api/public-key` to the local emulator automatically.

---

## API Endpoints

### `POST /api/signQR`
Signs an SQDSR plaintext string server-side.

**Request**
```json
{ "plaintext": "<SQDSR string before signature>" }
```

**Response**
```json
{ "signature": "<Base64 RSA-2048 signature>" }
```

---

### `GET /api/public-key`
Returns the current RSA public key as a PEM string. Share this URL with the validator team — they should fetch it daily to stay in sync with key rotations.

**Response** — `application/x-pem-file`
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkq...
-----END PUBLIC KEY-----
```

---

## For Validators

The validator team receives one URL:

```
https://svp-qr-generator.web.app/api/public-key
```

- Fetch this **daily** — the key rotates at **midnight UTC**
- Format: RSA-2048 SPKI PEM — works with OpenSSL, Java, Python, Go, .NET
- Algorithm: `RSASSA-PKCS1-v1_5 / SHA-256`
- Verify the payload: everything in the QR **before** `|{SIG:...}`

**Verification example (OpenSSL):**
```bash
# Save the public key
curl https://svp-qr-generator.web.app/api/public-key > public-key.pem

# Verify a QR signature
echo -n "<plaintext>" | openssl dgst -sha256 -verify public-key.pem \
  -signature <(echo "<base64-sig>" | base64 -d)
# Expected: Verified OK
```

---

## Key Rotation

Keys rotate automatically — no action required.

| What | Detail |
|------|--------|
| Schedule | Daily at 00:00 UTC (`rotateKeys` Cloud Function) |
| Old versions | Retained in Secret Manager for audit |
| Propagation | New key active within 1 hour (in-memory cache TTL) |
| Validator action | Fetch `/api/public-key` daily |

To trigger a manual rotation:
```bash
firebase functions:shell
# then inside shell:
rotateKeys()
```

---

## Security Notes

- The RSA **private key never leaves Google Cloud** — it is generated, stored, and used entirely within Secret Manager and Cloud Functions
- The **public key is intentionally public** — sharing it allows validators to verify QR authenticity without any risk
- QR payload **refreshes every 30 seconds** (TAG 84 QR Updated Time) to prevent QR copying/replay
- Scheme 0x03 provides **integrity and authenticity** (RSA signature) but not confidentiality — ticket data is readable in plaintext
- Scheme 0x04 (future) adds AES encryption of the Ticket Block for confidentiality
