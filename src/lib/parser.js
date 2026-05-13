/**
 * SQDSR Parser — reconstructs a dataset object from a raw QR string.
 * The returned shape mirrors what buildDataset() produces so it can be
 * passed directly to PayloadBreakdown and the spec validator.
 *
 * Expected format (Part II Table 5.14 / page 31-32):
 *   #<QR_Signature>#<QR_SVC>#<QR_Tkt_Block>#<QR_Dynamic_Data>#
 *
 *   QR_SVC       = {sec{ver}{f1|f2|...|f11}}
 *   QR_Tkt_Block = {(<opId|noTkts|valInfo|[tkt_f1|...|tkt_f10]>)}
 *   QR_Dynamic_Data = {updatedTime|qrStatus|lat|lon|opDyn}
 *
 * signableStr (used for signature verification) = QR_SVC#QR_Tkt_Block
 */

import { serialDisplay } from './dataset.js'
import { CMRL } from '../constants/stations.js'

function hex2int(h) { return parseInt(h, 16) }

export function parseQRString(raw) {
  const trimmed = raw.trim()

  // ── Split on '#' delimiter ────────────────────────────────
  // Format: #sig#svc#tkt#dyn# → split gives ['', sig, svc, tkt, dyn, '']
  if (!trimmed.startsWith('#') || !trimmed.endsWith('#')) {
    throw new Error('QR string must start and end with #')
  }
  const parts = trimmed.slice(1, -1).split('#')
  if (parts.length !== 4) {
    throw new Error(`Expected 4 #-delimited sections, got ${parts.length}`)
  }
  const [signatureB64, svcRaw, tktRaw, dynRaw] = parts

  if (!signatureB64) throw new Error('Signature section is empty')

  // ── Parse QR_SVC: {sec{ver}{f1|...|f11}} ─────────────────
  const svcMatch = svcRaw.match(/^\{(\w+)\{(\w+)\}\{([^}]+)\}\}$/)
  if (!svcMatch) {
    throw new Error('QR_SVC structure invalid — expected {sec{ver}{fields}}')
  }
  const [, secHex, verHex, commonRaw] = svcMatch
  const svcFields = commonRaw.split('|')
  if (svcFields.length !== 11) {
    throw new Error(`QR_SVC common fields: expected 11, got ${svcFields.length}`)
  }
  const [
    langHex, tgIdHex, txnTypeHex,
    serialHex, genDtHex, reqIdHex, txnRefHex,
    totalFareHex, bLatHex, bLonHex, mobileHex,
  ] = svcFields

  const genDt = hex2int(genDtHex)

  const security = {
    tag: '81', label: 'QR Security', totalBytes: 1, hex: secHex,
    fields: [{
      name: 'Security Scheme', size: 1, hex: secHex,
      desc: `Scheme 0x${secHex} — ${hex2int(secHex) === 0x03 ? 'RSA-2048 + SHA-256 digital signing, no encryption' : 'Unknown scheme'}`,
    }],
  }

  const version = {
    tag: '82', label: 'QR Dataset Version', totalBytes: 1, hex: verHex,
    fields: [{
      name: 'Version', size: 1, hex: verHex,
      desc: `0x${verHex} ${hex2int(verHex) === 0x04 ? '= v1.0' : '(unknown version)'}`,
    }],
  }

  const commonData = {
    tag: '83', label: 'QR Common Data', totalBytes: 62,
    serial: serialHex, genDt,
    fields: [
      { name: 'Language',               size: 1,  hex: langHex,      desc: `0x${langHex} = ${hex2int(langHex) === 0 ? 'English' : 'Other'}` },
      { name: 'TG ID',                  size: 2,  hex: tgIdHex,      desc: `Ticket Generator 0x${tgIdHex}${hex2int(tgIdHex) === CMRL.TG_ID ? ' (CMRL)' : ''}` },
      { name: 'Transaction Type',       size: 1,  hex: txnTypeHex,   desc: `0x${txnTypeHex} = ${hex2int(txnTypeHex) === 0x41 ? 'QR Purchase' : 'Other'}` },
      { name: 'Ticket Serial No',       size: 8,  hex: serialHex,    desc: `Display: ${serialDisplay(serialHex)}` },
      { name: 'QR Gen Datetime',        size: 4,  hex: genDtHex,     desc: `Unix ${genDt} → ${new Date(genDt * 1000).toUTCString()}` },
      { name: 'Requester ID (App ID)',  size: 4,  hex: reqIdHex,     desc: `App ID: 0x${reqIdHex}` },
      { name: 'TXN Ref No',             size: 22, hex: txnRefHex,    desc: 'Payment gateway reference — 22 alphanumeric chars' },
      { name: 'Total Fare',             size: 4,  hex: totalFareHex, desc: `${hex2int(totalFareHex)} paisa (SVP — fare settled at exit)` },
      { name: 'Booking Latitude',       size: 3,  hex: bLatHex,      desc: hex2int(bLatHex) === 0 ? 'Not provided' : `Lat: 0x${bLatHex}` },
      { name: 'Booking Longitude',      size: 3,  hex: bLonHex,      desc: hex2int(bLonHex) === 0 ? 'Not provided' : `Lon: 0x${bLonHex}` },
      { name: 'Mobile',                 size: 10, hex: mobileHex,    desc: `Customer mobile: ${mobileHex}` },
    ],
  }

  // ── Parse QR_Tkt_Block ──────────────────────────────────
  // Scheme 0x03 (plain):     {(<opId|noTkts|valInfo|[f1|...|f10]>)}
  // Scheme 0x04 (encrypted): {(<opId|noTkts|valInfo|<Base64==>)}
  const tktMatchPlain = tktRaw.match(/^\{\(<([^|]+)\|([^|]+)\|([^|]+)\|\[(.+)\]>\)\}$/)
  // Scheme 0x04: Base64 directly (no inner <>), e.g. {(<87|1|11|Base64>)}
  const tktMatchEnc   = !tktMatchPlain && tktRaw.match(/^\{\(<([^|]+)\|([^|]+)\|([^|]+)\|([A-Za-z0-9+/=]+)>\)\}$/)

  if (!tktMatchPlain && !tktMatchEnc) {
    throw new Error('QR_Tkt_Block structure invalid — expected {(<opId|noTkts|valInfo|[…]>)} or {(<opId|noTkts|valInfo|<Base64>>)}')
  }

  let ticketBlock
  if (tktMatchPlain) {
    const [, opIdHex, noTktsHex, valInfoHex, tktFieldsRaw] = tktMatchPlain
    const tkt = tktFieldsRaw.split('|')
    if (tkt.length !== 10) {
      throw new Error(`Ticket fields: expected 10, got ${tkt.length}`)
    }
    const [
      grpSizeHex, srcHex, dstHex, actDtHex,
      prodIdHex, svcIdHex, tktFareHex,
      validityHex, durationHex, opTktDataHex,
    ] = tkt

    const actDt      = hex2int(actDtHex)
    const prodId     = hex2int(prodIdHex)
    const tktBalance = hex2int(opTktDataHex.slice(0, 8))
    const accountId  = opTktDataHex.slice(8)

    ticketBlock = {
      tag: '85', label: 'QR Ticket Block — Dynamic Block',
      opId: opIdHex, noTkts: noTktsHex, valInfo: valInfoHex,
      ticket: [
        { name: 'Group Size',              size: 1,  hex: grpSizeHex,    desc: `${hex2int(grpSizeHex)} passenger(s)` },
        { name: 'Source Station',          size: 2,  hex: srcHex,        desc: hex2int(srcHex) === 0xFF ? 'SVP open journey (0x00FF) — CMRL operator-specific code' : `Station code: 0x${srcHex}` },
        { name: 'Destination Station',     size: 2,  hex: dstHex,        desc: hex2int(dstHex) === 0xFF ? 'SVP open journey (0x00FF) — CMRL operator-specific code' : `Station code: 0x${dstHex}` },
        { name: 'Activation Datetime',     size: 4,  hex: actDtHex,      desc: new Date(actDt * 1000).toUTCString() },
        { name: 'Product ID',              size: 2,  hex: prodIdHex,     desc: `0x${prodIdHex} = ${prodId === CMRL.PRODUCT_SVP ? 'Store Value Pass (SVP) — CMRL product ID 105' : `Product ${prodId}`}` },
        { name: 'Service ID',              size: 1,  hex: svcIdHex,      desc: `0x${svcIdHex} = ${hex2int(svcIdHex) === 1 ? 'Metro Rail' : 'Other service'}` },
        { name: 'Ticket Fare',             size: 4,  hex: tktFareHex,    desc: `${hex2int(tktFareHex)} paisa (SVP — settled by AFC at exit)` },
        { name: 'Validity',                size: 2,  hex: validityHex,   desc: `${hex2int(validityHex)} minutes` },
        { name: 'Duration',                size: 2,  hex: durationHex,   desc: `${hex2int(durationHex)} minutes — max journey timeout` },
        { name: 'Op-specific Ticket Data', size: 8,  hex: opTktDataHex,  desc: `SVP Balance [4B]: ₹${tktBalance / 100} | Account ID [4B]: 0x${accountId}` },
      ],
    }
  } else {
    // Scheme 0x04 — ticket content is AES-256-ECB encrypted, fields not accessible
    const [, opIdHex, noTktsHex, valInfoHex, encB64] = tktMatchEnc
    ticketBlock = {
      tag: '85', label: 'QR Ticket Block — Dynamic Block (AES-256-ECB encrypted)',
      opId: opIdHex, noTkts: noTktsHex, valInfo: valInfoHex,
      encrypted: true, encryptedB64: encB64,
      ticket: [
        {
          name: 'Ticket Data (encrypted)',
          size: null,
          hex: encB64,
          desc: `AES-256-ECB encrypted ticket fields — Base64 ciphertext (${encB64.length} chars). Decryptable by AFC validators with shared AES key.`,
        },
      ],
    }
  }

  // ── Parse QR_Dynamic_Data: {updatedTime||||} ──────────────
  // Spec Table 5.14: only QR Updated Time carries a value; remaining fields are empty.
  const dynInner = dynRaw.match(/^\{([^}]*)\}$/)
  if (!dynInner) throw new Error('QR_Dynamic_Data structure invalid — expected {fields}')
  const dyn = dynInner[1].split('|')
  if (dyn.length !== 5) throw new Error(`Dynamic fields: expected 5, got ${dyn.length}`)
  const [updatedTimeHex, qrStatusHex, dLatHex, dLonHex, opDynHex] = dyn

  const updatedTime = hex2int(updatedTimeHex)

  const dynamicData = {
    tag: '84', label: 'QR Dynamic Data', totalBytes: 32,
    fields: [
      { name: 'QR Updated Time',          size: 4,  hex: updatedTimeHex,    desc: `Unix ${updatedTime} → ${new Date(updatedTime * 1000).toUTCString()}` },
      { name: 'QR Status',                size: 3,  hex: qrStatusHex || '', desc: qrStatusHex ? `Operator+State: 0x${qrStatusHex}` : 'Not set (APP-rendered)' },
      { name: 'Latitude',                 size: 3,  hex: dLatHex || '',     desc: 'Not used' },
      { name: 'Longitude',                size: 3,  hex: dLonHex || '',     desc: 'Not used' },
      { name: 'Op-specific Dynamic Data', size: 19, hex: opDynHex || '',    desc: 'Not set (APP-rendered)' },
    ],
  }

  // signableStr is what was signed: QR_SVC#QR_Tkt_Block
  const signableStr = `${svcRaw}#${tktRaw}`

  return {
    dataset:      { security, version, commonData, dynamicData, ticketBlock },
    signableStr,
    signature:    signatureB64,
    finalPayload: trimmed,
  }
}
