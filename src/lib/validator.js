/**
 * Spec Validator — CDAC QR Ticketing Specification v1.0
 * Checks a generated dataset + payload against Part I and Part II rules.
 *
 * Returns an array of CheckResult objects:
 *   { id, section, description, status: 'PASS'|'FAIL'|'WARN', detail }
 */

import {
  SECURITY_SCHEME, DATASET_VERSION, TXN_TYPE, QR_STATE, LANG,
  SVP_DEFAULTS,
} from '../constants/spec.js'
import { CMRL } from '../constants/stations.js'
import { toHex } from './dataset.js'
import { verify, exportPublicKeyB64 } from './crypto.js'

// ── Helpers ─────────────────────────────────────────────────

function pass(id, section, description, detail = '') {
  return { id, section, description, status: 'PASS', detail }
}
function fail(id, section, description, detail = '') {
  return { id, section, description, status: 'FAIL', detail }
}
function warn(id, section, description, detail = '') {
  return { id, section, description, status: 'WARN', detail }
}

// ── Main validator ───────────────────────────────────────────

/**
 * @param {object} result — { dataset, signableStr, signature, finalPayload }
 * @returns {Promise<CheckResult[]>}
 */
export async function validatePayload(result) {
  const checks = []
  const { dataset, signableStr, signature, finalPayload } = result
  const { security, version, commonData, dynamicData, ticketBlock } = dataset

  // ── TAG 81: QR Security ────────────────────────────────
  const secByte = parseInt(security.fields[0].hex, 16)
  const validSchemes = [SECURITY_SCHEME.RSA_SIGN, SECURITY_SCHEME.SECURE_QR_ALPHA]
  const schemeLabels = { [SECURITY_SCHEME.RSA_SIGN]: '0x03 (RSA-2048 + SHA-256)', [SECURITY_SCHEME.SECURE_QR_ALPHA]: '0x04 (AES-256-ECB + RSA-2048)' }
  checks.push(
    validSchemes.includes(secByte)
      ? pass('S01', 'TAG 81 §5.1', `Security scheme = ${schemeLabels[secByte]}`,
             `Hex: ${security.fields[0].hex}`)
      : fail('S01', 'TAG 81 §5.1', 'Security scheme must be 0x03 or 0x04',
             `Got: 0x${security.fields[0].hex}`)
  )

  // ── TAG 82: Dataset Version ────────────────────────────
  const verByte = parseInt(version.fields[0].hex, 16)
  checks.push(
    verByte === DATASET_VERSION
      ? pass('V01', 'TAG 82 §5.2', 'Dataset version = 0x04 (v1.0)',
             `Hex: ${version.fields[0].hex}`)
      : fail('V01', 'TAG 82 §5.2', 'Dataset version must be 0x04',
             `Got: 0x${version.fields[0].hex}`)
  )

  // ── TAG 83: Common Data (62 bytes) ────────────────────
  const cdBytes = commonData.fields.reduce((a, f) => a + f.size, 0)
  checks.push(
    cdBytes === 62
      ? pass('C01', 'TAG 83 §5.3', 'Common Data total = 62 bytes', `Sum: ${cdBytes}`)
      : fail('C01', 'TAG 83 §5.3', 'Common Data must be exactly 62 bytes', `Got: ${cdBytes}`)
  )

  // Language must be 0x00 (English) per Appendix IV Table AN4
  const langByte = parseInt(commonData.fields.find(f => f.name === 'Language')?.hex ?? 'FF', 16)
  checks.push(
    langByte === LANG.ENGLISH
      ? pass('C02', 'TAG 83 §5.3 + App.IV', 'Language = 0x00 (English)',
             `Hex: ${toHex(langByte, 1)}`)
      : fail('C02', 'TAG 83 §5.3 + App.IV', `Language must be 0x00 (English); got 0x${toHex(langByte, 1)}`,
             'Appendix IV Table AN4: English=0, Hindi=1, Tamil=5')
  )

  // TG ID must match CMRL
  const tgHex = commonData.fields.find(f => f.name === 'TG ID')?.hex
  checks.push(
    tgHex === toHex(CMRL.TG_ID, 2)
      ? pass('C03', 'TAG 83 §5.3', `TG ID = 0x${toHex(CMRL.TG_ID, 2)} (CMRL)`, `Hex: ${tgHex}`)
      : fail('C03', 'TAG 83 §5.3', 'TG ID mismatch', `Expected 0x${toHex(CMRL.TG_ID, 2)}, got 0x${tgHex}`)
  )

  // TXN Type must be 0x41 (Purchase)
  const txnHex = commonData.fields.find(f => f.name === 'Transaction Type')?.hex
  checks.push(
    parseInt(txnHex, 16) === TXN_TYPE.PURCHASE
      ? pass('C04', 'TAG 83 Table 4.1', 'TXN Type = 0x41 (QR Purchase)', `Hex: ${txnHex}`)
      : fail('C04', 'TAG 83 Table 4.1', 'TXN Type must be 0x41 (Purchase)', `Got: 0x${txnHex}`)
  )

  // Serial No: 16 hex chars = 8 bytes
  const serialHex = commonData.fields.find(f => f.name === 'Ticket Serial No')?.hex ?? ''
  checks.push(
    serialHex.length === 16
      ? pass('C05', 'TAG 83 §4', 'Serial No = 8 bytes (16 hex chars)', serialHex)
      : fail('C05', 'TAG 83 §4', 'Serial No must be 8 bytes', `Got ${serialHex.length / 2} bytes`)
  )

  // Serial No source bits (bits 31-30 of second 4-byte word) = 01 (Mobile)
  const seqWord = parseInt(serialHex.slice(8), 16)
  const srcBits = (seqWord >>> 30) & 0x3
  checks.push(
    srcBits === 0b01
      ? pass('C06', 'TAG 83 §4', 'Serial QR source = 01 (Mobile app)', `Bits 31-30: ${srcBits.toString(2).padStart(2,'0')}`)
      : warn('C06', 'TAG 83 §4', `Serial QR source bits = ${srcBits.toString(2).padStart(2,'0')} (expected 01 for Mobile)`,
             'Allowed: 00=Undefined, 01=Mobile, 10=WebClient, 11=TOM')
  )

  // TXN Ref: 22 chars
  const txnRef = commonData.fields.find(f => f.name === 'TXN Ref No')?.hex ?? ''
  checks.push(
    txnRef.length === 22
      ? pass('C07', 'TAG 83 §5.3', 'TXN Ref No = 22 characters', txnRef)
      : fail('C07', 'TAG 83 §5.3', 'TXN Ref No must be exactly 22 characters', `Got: ${txnRef.length}`)
  )

  // Mobile: 10 digits
  const mobileHex = commonData.fields.find(f => f.name === 'Mobile')?.hex ?? ''
  checks.push(
    mobileHex.length === 10
      ? pass('C08', 'TAG 83 §5.3', 'Mobile = 10 digits', mobileHex)
      : fail('C08', 'TAG 83 §5.3', 'Mobile field must be 10 chars', `Got: ${mobileHex.length}`)
  )

  // ── TAG 84: Dynamic Data (32 bytes) ───────────────────
  const ddBytes = dynamicData.fields.reduce((a, f) => a + f.size, 0)
  checks.push(
    ddBytes === 32
      ? pass('D01', 'TAG 84 §5.4', 'Dynamic Data total = 32 bytes', `Sum: ${ddBytes}`)
      : fail('D01', 'TAG 84 §5.4', 'Dynamic Data must be exactly 32 bytes', `Got: ${ddBytes}`)
  )

  // QR Status — empty per spec Table 5.14 (APP renders as empty, gate reads from ticket block)
  const qrStatusHex = dynamicData.fields.find(f => f.name === 'QR Status')?.hex ?? ''
  checks.push(
    qrStatusHex === ''
      ? pass('D02', 'TAG 84 Table 5.14', 'QR Status field empty — correct per spec (APP-rendered)',
             'Spec Table 5.14 shows status as empty in dynamic block')
      : warn('D02', 'TAG 84 Table 5.14', 'QR Status field has value — spec expects empty',
             `Got: 0x${qrStatusHex}`)
  )

  // SVP balance check — only for unencrypted scheme (0x04 ciphertext not readable)
  if (!ticketBlock.encrypted) {
    const opTktDataHex = ticketBlock.ticket.find(f => f.name === 'Op-specific Ticket Data')?.hex ?? ''
    const balancePaisa = parseInt(opTktDataHex.slice(0, 8), 16)
    checks.push(
      balancePaisa >= SVP_DEFAULTS.MIN_BALANCE
        ? pass('D03', 'TAG 85 + Business Rule', `SVP balance ≥ ₹50 minimum (₹${balancePaisa / 100})`,
               `Balance from ticket block op-data: ${balancePaisa} paisa`)
        : fail('D03', 'TAG 85 + Business Rule', `SVP balance below ₹50 minimum floor`,
               `Balance: ${balancePaisa} paisa (min: ${SVP_DEFAULTS.MIN_BALANCE} paisa)`)
    )
  } else {
    checks.push(pass('D03', 'TAG 85 + Business Rule',
      'SVP balance check skipped — ticket data AES-encrypted (Scheme 0x04)',
      'Balance not verifiable from ciphertext; validated by AFC at tap-in'))
  }

  // ── TAG 85: Ticket Block ───────────────────────────────

  // Operator ID must match CMRL
  const opIdHex = ticketBlock.opId
  checks.push(
    opIdHex === toHex(CMRL.OPERATOR_ID, 2)
      ? pass('T01', 'TAG 85 §5.5', `Operator ID = 0x${toHex(CMRL.OPERATOR_ID, 2)} (CMRL)`,
             `Hex: ${opIdHex}`)
      : fail('T01', 'TAG 85 §5.5', 'Operator ID mismatch',
             `Expected 0x${toHex(CMRL.OPERATOR_ID, 2)}, got 0x${opIdHex}`)
  )

  // No of Tickets = 1
  const noTkts = parseInt(ticketBlock.noTkts, 16)
  checks.push(
    noTkts === 1
      ? pass('T02', 'TAG 85 §5.5', 'No of Tickets = 1', `Hex: ${ticketBlock.noTkts}`)
      : warn('T02', 'TAG 85 §5.5', `No of Tickets = ${noTkts} (expected 1 for SVP)`,
             `Hex: ${ticketBlock.noTkts}`)
  )

  // Validator Info MSN (bits 7-4) must be ≥ 0x10 (at least one scanner capability set)
  const valInfoByte = parseInt(ticketBlock.valInfo, 16)
  const msn = (valInfoByte >> 4) & 0x0F
  checks.push(
    msn >= 1
      ? pass('T03', 'TAG 85 Table 5.10', `Validator Info MSN = 0x${msn.toString(16).toUpperCase()} (scanner capability set)`,
             `Full byte: 0x${ticketBlock.valInfo} — Bit4=Camera`)
      : fail('T03', 'TAG 85 Table 5.10', 'Validator Info MSN must have ≥ 1 scanner capability bit set (≥ 0x10)',
             'At least Camera (Bit4=1) or Laser (Bit5=1) must be set')
  )

  // Encryption bit (bit0): must match scheme — 0 for 0x03, 1 for 0x04
  const encBit        = valInfoByte & 0x01
  const expectEncBit  = secByte === SECURITY_SCHEME.SECURE_QR_ALPHA ? 1 : 0
  checks.push(
    encBit === expectEncBit
      ? pass('T04', 'TAG 85 Table 5.10',
             encBit === 1 ? 'Validator Info encryption bit = 1 (AES-encrypted, Scheme 0x04)'
                          : 'Validator Info encryption bit = 0 (not encrypted, Scheme 0x03)',
             `Full byte: 0x${ticketBlock.valInfo}`)
      : fail('T04', 'TAG 85 Table 5.10',
             `Encryption bit mismatch — Scheme 0x0${secByte} expects encBit=${expectEncBit}`,
             `Got encBit=${encBit} from valInfo 0x${ticketBlock.valInfo}`)
  )

  // Ticket: 28 bytes for plain (0x03), skip for encrypted (0x04)
  const tktBytes = ticketBlock.encrypted
    ? null
    : ticketBlock.ticket.reduce((a, f) => a + (f.size ?? 0), 0)
  checks.push(
    ticketBlock.encrypted
      ? pass('T05', 'TAG 85 Table 5.11', 'Ticket data AES-encrypted (Scheme 0x04) — byte count not verifiable',
             `Base64 ciphertext length: ${ticketBlock.encryptedB64?.length ?? '?'} chars`)
      : tktBytes === 28
        ? pass('T05', 'TAG 85 Table 5.11', 'Ticket Info = 28 bytes', `Sum: ${tktBytes}`)
        : fail('T05', 'TAG 85 Table 5.11', 'Ticket Info must be exactly 28 bytes', `Got: ${tktBytes}`)
  )

  // Ticket field order per Table 5.11
  const expectedOrder = [
    'Group Size', 'Source Station', 'Destination Station', 'Activation Datetime',
    'Product ID', 'Service ID', 'Ticket Fare', 'Validity', 'Duration', 'Op-specific Ticket Data',
  ]
  const actualOrder = ticketBlock.ticket.map(f => f.name)
  const orderOk = expectedOrder.every((name, i) => actualOrder[i] === name)
  checks.push(
    orderOk
      ? pass('T06', 'TAG 85 Table 5.11', 'Ticket field order matches Table 5.11',
             expectedOrder.join(' → '))
      : fail('T06', 'TAG 85 Table 5.11', 'Ticket field order mismatch',
             `Expected: ${expectedOrder.join(', ')}\nActual: ${actualOrder.join(', ')}`)
  )

  // Product ID = SVP (0x0005)
  const prodHex = ticketBlock.ticket.find(f => f.name === 'Product ID')?.hex
  checks.push(
    prodHex === toHex(CMRL.PRODUCT_SVP, 2)
      ? pass('T07', 'TAG 85 §5.5', `Product ID = 0x${toHex(CMRL.PRODUCT_SVP, 2)} (SVP — CMRL 105)`,
             `Hex: ${prodHex}`)
      : fail('T07', 'TAG 85 §5.5', `Product ID must be SVP (0x${toHex(CMRL.PRODUCT_SVP, 2)} = 105)`,
             `Got: 0x${prodHex}`)
  )

  // Validity = 480 minutes (8 hours)
  const validityHex = ticketBlock.ticket.find(f => f.name === 'Validity')?.hex
  const validityMins = parseInt(validityHex, 16)
  checks.push(
    validityMins === SVP_DEFAULTS.VALIDITY_MINS
      ? pass('T08', 'TAG 85 §5.5', `Validity = ${validityMins} min (8 hours)`,
             `Hex: ${validityHex}`)
      : warn('T08', 'TAG 85 §5.5', `Validity = ${validityMins} min (expected ${SVP_DEFAULTS.VALIDITY_MINS})`,
             `Hex: ${validityHex}`)
  )

  // Duration = 180 minutes (max-fare timeout)
  const durationHex = ticketBlock.ticket.find(f => f.name === 'Duration')?.hex
  const durationMins = parseInt(durationHex, 16)
  checks.push(
    durationMins === SVP_DEFAULTS.DURATION_MINS
      ? pass('T09', 'TAG 85 §5.5', `Duration = ${durationMins} min (max-fare timeout)`,
             `Hex: ${durationHex}`)
      : warn('T09', 'TAG 85 §5.5', `Duration = ${durationMins} min (expected ${SVP_DEFAULTS.DURATION_MINS})`,
             `Hex: ${durationHex}`)
  )

  // ── SQDSR Format ────────────────────────────────────────
  // Format: #sig#QR_SVC#QR_Tkt_Block#QR_Dynamic_Data#
  const sqdsr = /^#[^#]+#\{[^}]+\{[^}]+\}\{[^}]+\}\}#\{\(<.+>\)\}#\{[^}]+\}#$/.test(finalPayload)
  checks.push(
    sqdsr
      ? pass('F01', 'Part II Table 5.14', 'SQDSR structure: #sig#QR_SVC#QR_Tkt_Block#QR_Dyn# — valid',
             `Length: ${finalPayload.length} chars`)
      : fail('F01', 'Part II Table 5.14', 'SQDSR structure invalid — expected #sig#svc#tkt#dyn#',
             `Payload: ${finalPayload.slice(0, 80)}…`)
  )

  // QR_SVC nested structure {sec{ver}{11 common fields}}
  const svcMatch = signableStr?.match(/^\{(\w+)\{(\w+)\}\{([^}]+)\}\}/)
  if (svcMatch) {
    const commonParts = svcMatch[3].split('|')
    checks.push(
      commonParts.length === 11
        ? pass('F02', 'Part II §5.1.3', `QR_SVC has 11 common data fields in nested {sec{ver}{fields}} format`,
               `Fields: ${commonParts.length}`)
        : fail('F02', 'Part II §5.1.3', `QR_SVC common fields: expected 11, got ${commonParts.length}`,
               `Raw: ${svcMatch[3].slice(0, 60)}…`)
    )
  }

  // Final payload starts and ends with # (Table 5.14)
  checks.push(
    finalPayload.startsWith('#') && finalPayload.endsWith('#')
      ? pass('F03', 'Part II Table 5.14', 'Final payload delimited by # on both ends')
      : fail('F03', 'Part II Table 5.14', 'Final payload must start and end with #')
  )

  // ── Signature Verification ──────────────────────────────
  try {
    const valid = await verify(signableStr, signature)
    checks.push(
      valid
        ? pass('SIG1', 'Part II §5 RSA-2048', 'Signature verifies against generated public key',
               'RSASSA-PKCS1-v1_5 / SHA-256 ✓ — signed scope: QR_SVC#QR_Tkt_Block')
        : fail('SIG1', 'Part II §5 RSA-2048', 'Signature verification FAILED',
               'RSA signature does not match QR_SVC#QR_Tkt_Block')
    )
  } catch (e) {
    checks.push(fail('SIG1', 'Part II §5 RSA-2048', 'Signature verification threw an error', e.message))
  }

  // Signature length (Base64 of 256-byte RSA-2048 output ≈ 344 chars)
  checks.push(
    signature.length >= 340 && signature.length <= 348
      ? pass('SIG2', 'Part II §5', `Signature length = ${signature.length} chars (RSA-2048 Base64 ≈ 344)`)
      : warn('SIG2', 'Part II §5', `Signature length = ${signature.length} (expected ~344 for RSA-2048)`)
  )

  return checks
}

/** Summary counts from a checks array */
export function summarise(checks) {
  return {
    total:  checks.length,
    passed: checks.filter(c => c.status === 'PASS').length,
    failed: checks.filter(c => c.status === 'FAIL').length,
    warned: checks.filter(c => c.status === 'WARN').length,
  }
}
