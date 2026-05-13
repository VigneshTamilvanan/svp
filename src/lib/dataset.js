/**
 * QR Dataset builder — CDAC Part I spec
 * Constructs each tag section with exact field sizes.
 */

import {
  SECURITY_SCHEME, DATASET_VERSION, TXN_TYPE, QR_STATE,
  LANG, COMMON_DATA_FIELDS, SVP_DEFAULTS,
} from '../constants/spec.js'
import { CMRL } from '../constants/stations.js'

// ── Helpers ──────────────────────────────────────────────

/** Pad a number to a fixed-width uppercase hex string (use for fixed-width byte fields) */
export function toHex(value, bytes) {
  return (value >>> 0).toString(16).toUpperCase().padStart(bytes * 2, '0')
}

/** Hex without leading zeros (use for all simple numeric SQDSR fields) */
export function toHexTrim(value) {
  return (value >>> 0).toString(16).toUpperCase().replace(/^0+/, '') || '0'
}

/** Current unix time in seconds */
export function nowSec() {
  return Math.floor(Date.now() / 1000)
}

/** Right-pad / truncate a string to exactly n chars */
function padR(s, n) {
  return String(s ?? '').padEnd(n, '0').slice(0, n)
}

/** Left-pad digits-only string to n chars */
function padMobile(s, n) {
  return String(s ?? '').replace(/\D/g, '').padStart(n, '0').slice(0, n)
}

/**
 * Build Ticket Serial Number (8 bytes = 16 hex chars)
 * Structure: [4B unix datetime][2 bits QR source (Mobile=01) + 30 bits sequence]
 * Display format per spec: [DDMMYYYYhhmmss][M][xxxxxxxxxx]
 */
export function makeSerialNo() {
  const dtHex  = toHex(nowSec(), 4)
  const seq    = Math.floor(Math.random() * 1_073_741_823) + 1
  // Mobile source indicator = 01 → set bit30 → 0x40000000
  const seqWord = (0x40000000 | seq) >>> 0
  return dtHex + toHex(seqWord, 4)
}

/**
 * Convert serial number hex to display string per spec §4:
 * [DDMMYYYYhhmmss][M/W/T][xxxxxxxxxx]
 */
export function serialDisplay(hexStr) {
  const dtSec  = parseInt(hexStr.slice(0, 8), 16)
  const d      = new Date(dtSec * 1000)
  const p2     = n => String(n).padStart(2, '0')
  const seqRaw = parseInt(hexStr.slice(8), 16) & 0x3FFFFFFF
  return (
    `${p2(d.getDate())}${p2(d.getMonth() + 1)}${d.getFullYear()}` +
    `${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}` +
    `M${String(seqRaw).padStart(10, '0')}`
  )
}

// ── TAG 81 — QR Security (1 byte) ────────────────────────
export function buildSecurity(scheme = 3) {
  const schemeVal = scheme === 4 ? SECURITY_SCHEME.SECURE_QR_ALPHA : SECURITY_SCHEME.RSA_SIGN
  const hex = toHexTrim(schemeVal)
  const desc = scheme === 4
    ? 'Scheme 0x04 — AES-256-ECB ticket encryption + RSA-2048 / SHA-256 signing (SecureQR-Alpha)'
    : 'Scheme 0x03 — RSA-2048 + SHA-256 digital signing, no encryption (Medium-high security)'
  return {
    tag: '81',
    label: 'QR Security',
    totalBytes: 1,
    hex,
    fields: [
      {
        name: 'Security Scheme',
        size: COMMON_DATA_FIELDS.LANGUAGE, // 1
        hex,
        desc,
      },
    ],
  }
}

// ── TAG 82 — QR Dataset Version (1 byte) ─────────────────
export function buildVersion() {
  const hex = toHexTrim(DATASET_VERSION)
  return {
    tag: '82',
    label: 'QR Dataset Version',
    totalBytes: 1,
    hex,
    fields: [
      {
        name: 'Version',
        size: 1,
        hex,
        desc: 'v1.0 → 0x04 (binary 00000100: Major bits[3-8]=000001, Minor bits[1-2]=00)',
      },
    ],
  }
}

// ── TAG 83 — QR Common Data (62 bytes) ───────────────────
export function buildCommonData({ txnRef, mobile }) {
  const serial = makeSerialNo()
  const genDt  = nowSec()

  const fields = [
    {
      name: 'Language',
      size: 1,
      hex:  toHexTrim(LANG.ENGLISH),
      desc: '0x00 = English (Appendix IV Table AN4)',
    },
    {
      name: 'TG ID',
      size: 2,
      hex:  toHexTrim(CMRL.TG_ID),
      desc: `CMRL Ticket Generator (0x${toHex(CMRL.TG_ID, 2)})`,
    },
    {
      name: 'Transaction Type',
      size: 1,
      hex:  toHexTrim(TXN_TYPE.PURCHASE),
      desc: '0x41 = QR Purchase (payment mode b010, QR type b00001)',
    },
    {
      name: 'Ticket Serial No',
      size: 8,
      hex:  serial,
      desc: `Display: ${serialDisplay(serial)}`,
    },
    {
      name: 'QR Gen Datetime',
      size: 4,
      hex:  toHexTrim(genDt),
      desc: `Unix epoch ${genDt} → ${new Date(genDt * 1000).toUTCString()}`,
    },
    {
      name: 'Requester ID (App ID)',
      size: 4,
      hex:  toHexTrim(1),
      desc: 'App ID = 0x00000001 (mobile client)',
    },
    {
      name: 'TXN Ref No',
      size: 22,
      hex:  padR(txnRef, 22),
      desc: 'Payment gateway reference — 22 alphanumeric chars',
    },
    {
      name: 'Total Fare',
      size: 4,
      hex:  toHexTrim(0),
      desc: 'SVP — fare determined at exit by AFC, not fixed at QR generation',
    },
    {
      name: 'Booking Latitude',
      size: 3,
      hex:  toHexTrim(0),
      desc: 'Not provided (web client)',
    },
    {
      name: 'Booking Longitude',
      size: 3,
      hex:  toHexTrim(0),
      desc: 'Not provided (web client)',
    },
    {
      name: 'Mobile',
      size: 10,
      hex:  padMobile(mobile, 10),
      desc: `Customer mobile: ${mobile}`,
    },
  ]

  const byteSum = fields.reduce((a, f) => a + f.size, 0)
  if (byteSum !== 62) throw new Error(`Common Data byte sum ${byteSum} ≠ 62`)

  return { tag: '83', label: 'QR Common Data', totalBytes: 62, fields, serial, genDt }
}

// ── TAG 84 — QR Dynamic Data (32 bytes) ──────────────────
export function buildDynamicData({ svpBalancePaisa }) {
  // QR Status (3 bytes):
  //   Operator ID [2B] | Ticket Index [4 bits=1] | QR State [4 bits=1 Active]
  const qrStatus = toHexTrim(CMRL.OPERATOR_ID) + toHexTrim((1 << 4) | QR_STATE.ACTIVE)

  // Op-specific dynamic data (19 bytes): balance [4B] + reserved [15B]
  const opDyn = toHex(svpBalancePaisa, 4) + toHex(0, 15)

  const fields = [
    {
      name: 'QR Updated Time',
      size: 4,
      hex:  toHexTrim(nowSec()),
      desc: 'Current unix timestamp — app refreshes every 30 s to prevent QR copying',
    },
    {
      name: 'QR Status',
      size: 3,
      hex:  qrStatus,
      desc: `Operator 0x${toHex(CMRL.OPERATOR_ID, 2)} | Ticket Index=1 | State=Active(1)`,
    },
    {
      name: 'Latitude',
      size: 3,
      hex:  toHex(0, 3),
      desc: 'Not used — Metro gate is stationary',
    },
    {
      name: 'Longitude',
      size: 3,
      hex:  toHex(0, 3),
      desc: 'Not used',
    },
    {
      name: 'Op-specific Dynamic Data',
      size: 19,
      hex:  opDyn,
      desc: `SVP Balance [4B]: ₹${svpBalancePaisa / 100} | Reserved [15B]: 0x00…`,
    },
  ]

  const byteSum = fields.reduce((a, f) => a + f.size, 0)
  if (byteSum !== 32) throw new Error(`Dynamic Data byte sum ${byteSum} ≠ 32`)

  return { tag: '84', label: 'QR Dynamic Data', totalBytes: 32, fields }
}

// ── Ticket (28 bytes) ─────────────────────────────────────
function buildTicket({ svpBalancePaisa, svpAccountId }) {
  const actDt     = nowSec()
  const opTktData = toHex(svpBalancePaisa, 4) + toHex(svpAccountId & 0xFFFFFFFF, 4)

  const fields = [
    // Field order per Table 5.11 (Part I):
    // Group Size → Src → Dst → Activation Date → Product ID → Service ID
    //   → Total Fare → Validity → Duration → Op-specific Ticket Data
    {
      name: 'Group Size',
      size: 1,
      hex:  toHexTrim(1),
      desc: 'Single passenger',
    },
    {
      name: 'Source Station',
      size: 2,
      hex:  toHexTrim(CMRL.SVP_STATION),
      desc: 'SVP open journey (0xFF = 255) — CMRL operator-specific code',
    },
    {
      name: 'Destination Station',
      size: 2,
      hex:  toHexTrim(CMRL.SVP_STATION),
      desc: 'SVP open journey (0xFF = 255) — CMRL operator-specific code',
    },
    {
      name: 'Activation Datetime',
      size: 4,
      hex:  toHexTrim(actDt),
      desc: new Date(actDt * 1000).toUTCString(),
    },
    {
      name: 'Product ID',
      size: 2,
      hex:  toHexTrim(CMRL.PRODUCT_SVP),
      desc: `0x${toHex(CMRL.PRODUCT_SVP, 2)} = Store Value Pass (SVP) — CMRL product ID 105`,
    },
    {
      name: 'Service ID',
      size: 1,
      hex:  toHexTrim(CMRL.SERVICE_ID),
      desc: '0x01 = Metro Rail service',
    },
    {
      name: 'Ticket Fare',
      size: 4,
      hex:  toHexTrim(svpBalancePaisa),
      desc: `SVP wallet balance: ₹${svpBalancePaisa / 100} — AFC deducts journey fare at exit`,
    },
    {
      name: 'Validity',
      size: 2,
      hex:  toHexTrim(SVP_DEFAULTS.VALIDITY_MINS),
      desc: `${SVP_DEFAULTS.VALIDITY_MINS} minutes = 8 hours`,
    },
    {
      name: 'Duration',
      size: 2,
      hex:  toHexTrim(SVP_DEFAULTS.DURATION_MINS),
      desc: `${SVP_DEFAULTS.DURATION_MINS} minutes — max no-exit timeout per journey`,
    },
    {
      name: 'Op-specific Ticket Data',
      size: 8,
      hex:  opTktData,
      desc: `SVP Balance [4B]: ₹${svpBalancePaisa / 100} | Account ID [4B]: 0x${toHex(svpAccountId, 4)}`,
    },
  ]

  const byteSum = fields.reduce((a, f) => a + f.size, 0)
  if (byteSum !== 28) throw new Error(`Ticket byte sum ${byteSum} ≠ 28`)

  return fields
}

// ── TAG 85 — QR Ticket Block (Dynamic Block) ─────────────
export function buildTicketBlock(params, scheme = 3) {
  const opId   = toHexTrim(CMRL.OPERATOR_ID)
  const noTkts = toHexTrim(1)
  // Validator Info (1 byte):
  //   MSN (bits 7-4) = scanner capabilities — at least one MUST be set (≥ 0x10)
  //   Bit 4 = Camera scanner. Bit 0 = encryption flag (1 = encrypted, Scheme 0x04)
  //   0x10 = Camera, unencrypted (Scheme 0x03)
  //   0x11 = Camera, AES-encrypted (Scheme 0x04)
  const valInfo = toHexTrim(scheme === 4 ? 0x11 : 0x10)
  const ticket  = buildTicket(params)

  return {
    tag:      '85',
    label:    'QR Ticket Block — Dynamic Block',
    opId,
    noTkts,
    valInfo,
    ticket,
  }
}

/**
 * Refresh only TAG 84 (QR Updated Time) — keeps Common Data and Ticket Block
 * intact so the serial number and ticket fields are unchanged.
 * Called every N seconds to produce a fresh QR that validators accept.
 */
export function refreshDataset(existingDataset, svpBalancePaisa) {
  return {
    ...existingDataset,
    dynamicData: buildDynamicData({ svpBalancePaisa }),
  }
}

// ── Assemble full dataset ─────────────────────────────────
export function buildDataset(formValues) {
  const { balanceRupees, mobile, txnRef, scheme = 3 } = formValues

  const svpBalancePaisa = balanceRupees * 100
  const svpAccountId    = Math.floor(Math.random() * 0xFFFF) + 1

  const params = { svpBalancePaisa, svpAccountId, mobile, txnRef }

  return {
    security:    buildSecurity(scheme),
    version:     buildVersion(),
    commonData:  buildCommonData(params),
    dynamicData: buildDynamicData(params),
    ticketBlock: buildTicketBlock(params, scheme),
  }
}
